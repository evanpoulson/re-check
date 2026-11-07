-- Recheck database schema (Tiger Data / TimescaleDB)
--
-- Matches the API contract in api/src/recheck/contract and the data model in
-- AGENTS.md and docs/research/recheck-waiting-room.md, section 5.
--
-- Tables: visit, visit_session, submission, report, vitals, task, task_reason,
-- audit_log.
--
-- Time-series tables (report, vitals, audit_log) are hypertables partitioned on
-- the server's received time. Hypertable primary keys must include the time
-- column, so their PKs are (id, received_at) or (id, at). Duplicate retries are
-- caught by the submission table, which is a regular table keyed on the
-- client-generated ID.
--
-- Append-only: report, vitals, task_reason, submission and audit_log reject
-- UPDATE, DELETE and TRUNCATE. visit and task can be updated but not deleted.
-- Corrections are new rows that point at the row they replace.
--
-- Escalate-only: a task's level, escalation and status can only move forward,
-- and recorded acknowledgement and assessment can't be rewritten.
--
-- The app connects as recheck_app, which has no DELETE or TRUNCATE rights.
-- Every transaction that writes must say who is acting:
--   SET LOCAL app.actor = 'auth0|abc123';
-- Writes without it fail.
--
-- Clinical intervals and deadlines here are demo values for clinical review.

BEGIN;

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------------
-- Enumerated types (mirror api/src/recheck/contract/codes.py)
-- ---------------------------------------------------------------------------

CREATE TYPE complaint_group AS ENUM ('chest_back_pain', 'neuro_change', 'head_injury', 'general');

CREATE TYPE visit_status AS ENUM ('waiting', 'roomed', 'left', 'discharged');

-- The device a report came through.
CREATE TYPE channel AS ENUM ('phone', 'pager', 'desk');

-- Who answered. Independent of the channel.
CREATE TYPE reporter AS ENUM ('patient', 'companion', 'staff');

CREATE TYPE staff_role AS ENUM ('triage_nurse', 'physician', 'charge_nurse', 'quality');

CREATE TYPE checkin_overall AS ENUM ('better', 'same', 'worse');

-- Why a question has no answer. Never a negative.
CREATE TYPE missing_reason AS ENUM ('unsure', 'unable_to_respond', 'not_asked', 'not_reached');

CREATE TYPE finding_code AS ENUM (
    'chest_pain',
    'trouble_breathing',
    'new_confusion',
    'fainting',
    'new_weakness_numbness',
    'heavy_bleeding',
    'vomiting',
    'worst_headache',
    'speech_change',
    'facial_droop',
    'drowsiness',
    'vision_change',
    'balance_change'
);

CREATE TYPE concern_code AS ENUM ('worried', 'help_now');

CREATE TYPE report_kind AS ENUM ('checkin', 'concern', 'finding', 'leaving', 'staff_flag');

-- Lowest first: enum order is the escalate-only order.
CREATE TYPE task_level AS ENUM ('overdue', 'leave_risk', 'silent', 'amber', 'red');

-- Forward order: a task's status can only move right.
CREATE TYPE task_status AS ENUM ('open', 'acknowledged', 'completed');

CREATE TYPE disposition AS ENUM (
    'assessed_stable',
    'tests_ordered',
    're_triaged',
    'roomed',
    'treated_and_released',
    'left_before_assessment',
    'not_located'
);

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

-- Who is acting. Fails closed: a write without app.actor is an error, so the
-- audit log never silently records the shared database role.
CREATE FUNCTION current_actor() RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
    actor text := nullif(current_setting('app.actor', true), '');
BEGIN
    IF actor IS NULL THEN
        RAISE EXCEPTION 'app.actor is not set; run SET LOCAL app.actor = ... before writing'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN actor;
END
$$;

CREATE FUNCTION block_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only: % is not allowed', TG_ARGV[0], TG_OP
        USING ERRCODE = 'insufficient_privilege';
END
$$;

-- ---------------------------------------------------------------------------
-- visit: one waiting-room stay (FR1 to FR3)
-- No name or health number is stored. QR tokens are stored only as SHA-256
-- hashes; the raw tokens go on the QR cards and nowhere else.
-- ---------------------------------------------------------------------------

CREATE TABLE visit (
    id                       uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id                  text             NOT NULL CHECK (site_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
    -- CTAS 1 is never in the waiting room.
    ctas                     smallint         NOT NULL CHECK (ctas BETWEEN 2 AND 5),
    complaint_group          complaint_group  NOT NULL,
    cedis_code               text             CHECK (cedis_code ~ '^[0-9]{3}$'),
    language                 text             NOT NULL CHECK (language IN ('en', 'pa', 'tl')),
    channel                  channel          NOT NULL CHECK (channel IN ('phone', 'pager')),
    pager_no                 text             CHECK (pager_no ~ '^[0-9]{1,6}$'),
    -- Every visit gets a patient link (phone is the fallback for pager
    -- patients) and a companion link (FR11).
    patient_token_hash       bytea            NOT NULL UNIQUE CHECK (octet_length(patient_token_hash) = 32),
    companion_token_hash     bytea            NOT NULL UNIQUE CHECK (octet_length(companion_token_hash) = 32),
    patient_token_used_at    timestamptz,
    companion_token_used_at  timestamptz,
    tokens_expire_at         timestamptz      NOT NULL,
    triaged_at               timestamptz      NOT NULL DEFAULT now(),
    status                   visit_status     NOT NULL DEFAULT 'waiting',
    closed_at                timestamptz,
    -- Two independent timers. A patient report never moves the staff one.
    next_prompt_due_at       timestamptz,
    staff_reassess_due_at    timestamptz,
    last_staff_check_at      timestamptz,
    CONSTRAINT visit_pager_matches_channel CHECK ((channel = 'pager') = (pager_no IS NOT NULL)),
    CONSTRAINT visit_closed_matches_status CHECK ((status = 'waiting') = (closed_at IS NULL))
);

-- A physical pager can only be bound to one waiting patient at a time.
CREATE UNIQUE INDEX visit_pager_waiting_uq ON visit (site_id, pager_no) WHERE status = 'waiting' AND pager_no IS NOT NULL;

CREATE INDEX visit_waiting_prompt_idx ON visit (next_prompt_due_at) WHERE status = 'waiting';
CREATE INDEX visit_waiting_reassess_idx ON visit (staff_reassess_due_at) WHERE status = 'waiting';

-- CTAS re-check interval (FR4). Demo defaults for clinical review. CTAS 1 has
-- none because it is never in the waiting room.
CREATE FUNCTION ctas_interval(level smallint) RETURNS interval
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE level
        WHEN 2 THEN interval '15 minutes'
        WHEN 3 THEN interval '30 minutes'
        WHEN 4 THEN interval '60 minutes'
        WHEN 5 THEN interval '120 minutes'
    END
$$;

-- Start both timers from the CTAS schedule when the nurse creates a visit.
CREATE FUNCTION visit_set_first_due() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.next_prompt_due_at := coalesce(NEW.next_prompt_due_at, NEW.triaged_at + ctas_interval(NEW.ctas));
    NEW.staff_reassess_due_at := coalesce(NEW.staff_reassess_due_at, NEW.triaged_at + ctas_interval(NEW.ctas));
    RETURN NEW;
END
$$;

CREATE TRIGGER visit_set_first_due
    BEFORE INSERT ON visit
    FOR EACH ROW EXECUTE FUNCTION visit_set_first_due();

-- ---------------------------------------------------------------------------
-- visit_session: a device bound to a visit by exchanging a one-time token
-- ---------------------------------------------------------------------------

CREATE TABLE visit_session (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id      uuid         NOT NULL REFERENCES visit (id),
    role          reporter     NOT NULL CHECK (role IN ('patient', 'companion')),
    session_hash  bytea        NOT NULL UNIQUE CHECK (octet_length(session_hash) = 32),
    created_at    timestamptz  NOT NULL DEFAULT now(),
    expires_at    timestamptz  NOT NULL,
    revoked_at    timestamptz
);

CREATE INDEX visit_session_visit_idx ON visit_session (visit_id);

-- ---------------------------------------------------------------------------
-- submission: one row per client-generated submission ID
-- A retry with the same ID and fingerprint is a duplicate; the same ID with a
-- different fingerprint is rejected.
-- ---------------------------------------------------------------------------

CREATE TABLE submission (
    id           uuid         PRIMARY KEY,
    actor        text         NOT NULL,
    endpoint     text         NOT NULL,
    fingerprint  bytea        NOT NULL CHECK (octet_length(fingerprint) = 32),
    visit_id     uuid         REFERENCES visit (id),
    received_at  timestamptz  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- report: every input path writes this same record (hypertable)
-- Patient and companion reports from phone, pager and simulator, plus the
-- triage nurse's "flag higher". id is the client's submission ID.
-- ---------------------------------------------------------------------------

CREATE TABLE report (
    id                     uuid             NOT NULL,
    visit_id               uuid             NOT NULL REFERENCES visit (id),
    received_at            timestamptz      NOT NULL DEFAULT now(),
    captured_at            timestamptz      NOT NULL,
    kind                   report_kind      NOT NULL,
    reporter               reporter         NOT NULL,
    channel                channel          NOT NULL,
    -- Check-in answers: each is a value or a missing reason, never both.
    questionnaire_version  text,
    overall                checkin_overall,
    overall_missing        missing_reason,
    pain                   smallint         CHECK (pain BETWEEN 0 AND 10),
    pain_missing           missing_reason,
    findings               finding_code[],
    findings_missing       missing_reason,
    -- Complaint-specific answers keyed by question bank item key (FR6).
    items                  jsonb            NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(items) = 'object'),
    concern                concern_code,
    -- Staff flag only.
    note                   text             CHECK (char_length(note) BETWEEN 1 AND 280),
    entered_by             text,
    PRIMARY KEY (id, received_at),
    CONSTRAINT report_staff_only_from_desk CHECK (
        (reporter = 'staff') = (channel = 'desk')
        AND (reporter = 'staff') = (kind = 'staff_flag')
        AND (reporter = 'staff') = (entered_by IS NOT NULL)
    ),
    CONSTRAINT report_checkin_shape CHECK (
        CASE WHEN kind = 'checkin' THEN
            questionnaire_version IS NOT NULL
            AND num_nonnulls(overall, overall_missing) = 1
            AND num_nonnulls(pain, pain_missing) = 1
            AND num_nonnulls(findings, findings_missing) = 1
            -- Pain is self-reported.
            AND (reporter <> 'companion' OR pain IS NULL)
        ELSE
            num_nonnulls(questionnaire_version, overall, overall_missing, pain, pain_missing, findings_missing) = 0
            AND items = '{}'
        END
    ),
    CONSTRAINT report_finding_shape CHECK (
        CASE kind
            WHEN 'finding' THEN coalesce(cardinality(findings), 0) >= 1
            WHEN 'checkin' THEN true
            ELSE findings IS NULL
        END
    ),
    CONSTRAINT report_concern_shape CHECK ((kind = 'concern') = (concern IS NOT NULL)),
    CONSTRAINT report_note_shape CHECK (kind = 'staff_flag' OR note IS NULL)
);

SELECT create_hypertable('report', by_range('received_at', interval '1 day'));

CREATE INDEX report_visit_received_idx ON report (visit_id, received_at DESC);

-- ---------------------------------------------------------------------------
-- vitals: nurse-entered repeat vitals (FR17) (hypertable)
-- Ranges catch typos, not abnormal values.
-- ---------------------------------------------------------------------------

CREATE TABLE vitals (
    id               uuid          NOT NULL,
    visit_id         uuid          NOT NULL REFERENCES visit (id),
    measured_at      timestamptz   NOT NULL,
    received_at      timestamptz   NOT NULL DEFAULT now(),
    sbp              smallint      CHECK (sbp BETWEEN 40 AND 300),
    dbp              smallint      CHECK (dbp BETWEEN 20 AND 200),
    hr               smallint      CHECK (hr BETWEEN 20 AND 250),
    rr               smallint      CHECK (rr BETWEEN 4 AND 60),
    spo2             smallint      CHECK (spo2 BETWEEN 50 AND 100),
    temp_c           numeric(3,1)  CHECK (temp_c BETWEEN 30 AND 44),
    entered_by       text          NOT NULL,
    entered_by_role  staff_role    NOT NULL,
    -- An earlier vitals row this one corrects. The original is kept.
    supersedes       uuid,
    PRIMARY KEY (id, received_at),
    CONSTRAINT vitals_has_value CHECK (num_nonnulls(sbp, dbp, hr, rr, spo2, temp_c) >= 1),
    CONSTRAINT vitals_bp_pair CHECK ((sbp IS NULL) = (dbp IS NULL) AND (dbp IS NULL OR dbp < sbp))
);

SELECT create_hypertable('vitals', by_range('received_at', interval '1 day'));

CREATE INDEX vitals_visit_measured_idx ON vitals (visit_id, measured_at DESC);

-- ---------------------------------------------------------------------------
-- task: one review task per concern, produced by the rules engine and timers
-- One open task per visit, routed to one or more roles in a single row. New
-- reasons are added as task_reason rows. Routing, delivery, acknowledgement
-- and assessment are separate steps.
-- ---------------------------------------------------------------------------

CREATE TABLE task (
    id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id              uuid          NOT NULL REFERENCES visit (id),
    level                 task_level    NOT NULL,
    status                task_status   NOT NULL DEFAULT 'open',
    escalated             boolean       NOT NULL DEFAULT false,
    routed_to             staff_role[]  NOT NULL CHECK (cardinality(routed_to) >= 1),
    created_at            timestamptz   NOT NULL DEFAULT now(),
    ack_due_at            timestamptz,
    delivered_at          timestamptz,
    acknowledged_at       timestamptz,
    acknowledged_by       text,
    acknowledged_by_role  staff_role,
    assessed_at           timestamptz,
    assessed_by           text,
    assessed_by_role      staff_role,
    disposition           disposition,
    CONSTRAINT task_ack_complete CHECK (num_nonnulls(acknowledged_at, acknowledged_by, acknowledged_by_role) IN (0, 3)),
    CONSTRAINT task_assess_complete CHECK (num_nonnulls(assessed_at, assessed_by, assessed_by_role, disposition) IN (0, 4)),
    CONSTRAINT task_status_matches_steps CHECK (
        CASE status
            WHEN 'open' THEN acknowledged_at IS NULL AND assessed_at IS NULL
            WHEN 'acknowledged' THEN acknowledged_at IS NOT NULL AND assessed_at IS NULL
            WHEN 'completed' THEN acknowledged_at IS NOT NULL AND assessed_at IS NOT NULL
        END
    )
);

-- One active task per visit, so retries and repeat alerts can't stack up.
CREATE UNIQUE INDEX task_one_open_per_visit ON task (visit_id) WHERE status <> 'completed';

CREATE INDEX task_open_idx ON task (created_at) WHERE status <> 'completed';
CREATE INDEX task_visit_created_idx ON task (visit_id, created_at DESC);

-- Escalate-only: nothing about a task can move backwards.
CREATE FUNCTION task_escalate_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'completed' THEN
        RAISE EXCEPTION 'task % is completed and cannot change', OLD.id USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.id <> OLD.id OR NEW.visit_id <> OLD.visit_id OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'task identity cannot change' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.level < OLD.level THEN
        RAISE EXCEPTION 'task level cannot go down (% to %)', OLD.level, NEW.level USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status < OLD.status THEN
        RAISE EXCEPTION 'task status cannot go back (% to %)', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.escalated AND NOT NEW.escalated THEN
        RAISE EXCEPTION 'task escalation cannot be undone' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT NEW.routed_to @> OLD.routed_to THEN
        RAISE EXCEPTION 'task recipients can be added, not removed' USING ERRCODE = 'check_violation';
    END IF;
    -- Keep the earliest actionable deadline.
    IF OLD.ack_due_at IS NOT NULL AND (NEW.ack_due_at IS NULL OR NEW.ack_due_at > OLD.ack_due_at) THEN
        RAISE EXCEPTION 'task deadline cannot move later' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at THEN
        RAISE EXCEPTION 'task delivery time cannot be rewritten' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.acknowledged_at IS NOT NULL
        AND (NEW.acknowledged_at, NEW.acknowledged_by, NEW.acknowledged_by_role)
            IS DISTINCT FROM (OLD.acknowledged_at, OLD.acknowledged_by, OLD.acknowledged_by_role) THEN
        RAISE EXCEPTION 'task acknowledgement cannot be rewritten' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER task_escalate_only
    BEFORE UPDATE ON task
    FOR EACH ROW EXECUTE FUNCTION task_escalate_only();

-- ---------------------------------------------------------------------------
-- task_reason: why a rule fired, pinned to its ruleset version
-- evidence is a list of {"kind": "report" | "vitals", "id": uuid}.
-- ---------------------------------------------------------------------------

CREATE TABLE task_reason (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id       uuid         NOT NULL REFERENCES task (id),
    rule_id       text         NOT NULL,
    rule_version  text         NOT NULL,
    level         task_level   NOT NULL,
    reason_code   text         NOT NULL,
    evidence      jsonb        NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
    fired_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX task_reason_task_idx ON task_reason (task_id, fired_at);

-- ---------------------------------------------------------------------------
-- audit_log: append-only record of every write (hypertable)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
    id       bigint GENERATED ALWAYS AS IDENTITY,
    at       timestamptz  NOT NULL DEFAULT now(),
    actor    text         NOT NULL,
    event    text         NOT NULL,
    payload  jsonb        NOT NULL DEFAULT '{}',
    PRIMARY KEY (id, at)
);

SELECT create_hypertable('audit_log', by_range('at', interval '7 days'));

CREATE INDEX audit_log_event_at_idx ON audit_log (event, at DESC);

-- One audit row per insert/update. event is "<table>.<op>", e.g.
-- "task.update". The table name is a trigger argument because on hypertables
-- TG_TABLE_NAME is the internal chunk. Token and session hashes are left out.
CREATE FUNCTION audit_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log (actor, event, payload)
    VALUES (
        current_actor(),
        TG_ARGV[0] || '.' || lower(TG_OP),
        to_jsonb(NEW) - 'patient_token_hash' - 'companion_token_hash' - 'session_hash' - 'fingerprint'
    );
    RETURN NEW;
END
$$;

CREATE TRIGGER visit_audit         AFTER INSERT OR UPDATE ON visit         FOR EACH ROW EXECUTE FUNCTION audit_write('visit');
CREATE TRIGGER visit_session_audit AFTER INSERT OR UPDATE ON visit_session FOR EACH ROW EXECUTE FUNCTION audit_write('visit_session');
CREATE TRIGGER report_audit        AFTER INSERT ON report                  FOR EACH ROW EXECUTE FUNCTION audit_write('report');
CREATE TRIGGER vitals_audit        AFTER INSERT ON vitals                  FOR EACH ROW EXECUTE FUNCTION audit_write('vitals');
CREATE TRIGGER task_audit          AFTER INSERT OR UPDATE ON task          FOR EACH ROW EXECUTE FUNCTION audit_write('task');
CREATE TRIGGER task_reason_audit   AFTER INSERT ON task_reason             FOR EACH ROW EXECUTE FUNCTION audit_write('task_reason');

-- Append-only tables: no UPDATE, DELETE or TRUNCATE for anyone.
-- Row triggers don't fire on TRUNCATE, so it gets a statement trigger.
CREATE TRIGGER report_append_only      BEFORE UPDATE OR DELETE ON report      FOR EACH ROW EXECUTE FUNCTION block_change('report');
CREATE TRIGGER vitals_append_only      BEFORE UPDATE OR DELETE ON vitals      FOR EACH ROW EXECUTE FUNCTION block_change('vitals');
CREATE TRIGGER task_reason_append_only BEFORE UPDATE OR DELETE ON task_reason FOR EACH ROW EXECUTE FUNCTION block_change('task_reason');
CREATE TRIGGER submission_append_only  BEFORE UPDATE OR DELETE ON submission  FOR EACH ROW EXECUTE FUNCTION block_change('submission');
CREATE TRIGGER audit_log_append_only   BEFORE UPDATE OR DELETE ON audit_log   FOR EACH ROW EXECUTE FUNCTION block_change('audit_log');

-- Records that change state are kept, never deleted.
CREATE TRIGGER visit_no_delete         BEFORE DELETE ON visit         FOR EACH ROW EXECUTE FUNCTION block_change('visit');
CREATE TRIGGER visit_session_no_delete BEFORE DELETE ON visit_session FOR EACH ROW EXECUTE FUNCTION block_change('visit_session');
CREATE TRIGGER task_no_delete          BEFORE DELETE ON task          FOR EACH ROW EXECUTE FUNCTION block_change('task');

CREATE TRIGGER visit_no_truncate         BEFORE TRUNCATE ON visit         FOR EACH STATEMENT EXECUTE FUNCTION block_change('visit');
CREATE TRIGGER visit_session_no_truncate BEFORE TRUNCATE ON visit_session FOR EACH STATEMENT EXECUTE FUNCTION block_change('visit_session');
CREATE TRIGGER submission_no_truncate    BEFORE TRUNCATE ON submission    FOR EACH STATEMENT EXECUTE FUNCTION block_change('submission');
CREATE TRIGGER report_no_truncate        BEFORE TRUNCATE ON report        FOR EACH STATEMENT EXECUTE FUNCTION block_change('report');
CREATE TRIGGER vitals_no_truncate        BEFORE TRUNCATE ON vitals        FOR EACH STATEMENT EXECUTE FUNCTION block_change('vitals');
CREATE TRIGGER task_no_truncate          BEFORE TRUNCATE ON task          FOR EACH STATEMENT EXECUTE FUNCTION block_change('task');
CREATE TRIGGER task_reason_no_truncate   BEFORE TRUNCATE ON task_reason   FOR EACH STATEMENT EXECUTE FUNCTION block_change('task_reason');
CREATE TRIGGER audit_log_no_truncate     BEFORE TRUNCATE ON audit_log     FOR EACH STATEMENT EXECUTE FUNCTION block_change('audit_log');

-- ---------------------------------------------------------------------------
-- App role: read and insert everywhere, update only where state changes,
-- never delete or truncate. Triggers above are the second line of defence,
-- because the table owner can disable triggers and drop TimescaleDB chunks.
-- Don't add a retention policy to report, vitals or audit_log.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'recheck_app') THEN
        CREATE ROLE recheck_app NOLOGIN;
    END IF;
END
$$;

REVOKE ALL ON visit, visit_session, submission, report, vitals, task, task_reason, audit_log FROM PUBLIC, recheck_app;
GRANT SELECT, INSERT ON visit, visit_session, submission, report, vitals, task, task_reason, audit_log TO recheck_app;
GRANT UPDATE ON visit, visit_session, task TO recheck_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO recheck_app;

COMMIT;
