-- Recheck database schema (Tiger Data / TimescaleDB)
--
-- Matches the API contract in api/src/recheck/contract and the data model in
-- AGENTS.md and docs/research/recheck-waiting-room.md, section 5.
--
-- Tables: visit, visit_session, submission, push_subscription, push_send,
-- attention_prompt, report, vitals, task, task_reason, audit_log, wait_site,
-- wait_snapshot, site_setting.
--
-- Time-series tables (report, vitals, audit_log, wait_snapshot) are hypertables partitioned on
-- the server's received time. Hypertable primary keys must include the time
-- column, so their PKs are (id, received_at) or (id, at). Duplicate retries are
-- caught by the submission table, which is a regular table keyed on the
-- client-generated ID.
--
-- Append-only: attention_prompt, report, vitals, task_reason, submission,
-- wait_snapshot and audit_log reject UPDATE, DELETE and TRUNCATE. visit and task can be updated
-- but not deleted.
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

-- Mapped from the CEDIS complaint by question-bank/cedis-groups.json.
CREATE TYPE complaint_group AS ENUM ('chest_back_pain', 'neuro_change', 'head_injury', 'confused_drowsy', 'general');

-- Why the patient app was not offered. Staff watch these patients directly.
CREATE TYPE app_exclusion AS ENUM ('child', 'pregnancy_over_20_weeks', 'self_harm_or_violence', 'major_trauma');

CREATE TYPE visit_status AS ENUM ('waiting', 'roomed', 'left', 'discharged');

-- The device a report came through.
CREATE TYPE channel AS ENUM ('phone', 'pager', 'desk');

-- Who answered. Independent of the channel.
CREATE TYPE reporter AS ENUM ('patient', 'companion', 'staff');

-- Why a visit session ended. Revoking is one-way. Sessions have no timer:
-- they last until one of these happens.
CREATE TYPE session_end_reason AS ENUM (
    'takeover', 'signed_out', 'staff_signed_out', 'visit_closed', 'app_excluded'
);

CREATE TYPE staff_role AS ENUM ('triage_nurse', 'physician', 'charge_nurse', 'quality');

-- Wellness questions adapted from the Patient Wellness Questionnaire (Martha's Rule).
CREATE TYPE feeling_now AS ENUM ('very_good', 'good', 'ok', 'poor', 'very_poor');
CREATE TYPE feeling_change AS ENUM ('much_better', 'better', 'same', 'worse', 'much_worse');

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

-- desk_question is non-clinical and goes to the triage nurse only.
CREATE TYPE concern_code AS ENUM ('worried', 'help_now', 'desk_question');

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
-- No name or health number is stored. Each app visit has one QR token. It has
-- no expiry: it works while the visit is waiting and offers the app (sign-in
-- checks this) and stops when the visit closes or is excluded. It is stored twice: a SHA-256 hash to look it up on scan,
-- and a copy encrypted by the API server (key held outside the database) so
-- the desk can show the same QR again. Neither reaches the audit log.
-- ---------------------------------------------------------------------------

CREATE TABLE visit (
    id                       uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id                  text             NOT NULL CHECK (site_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
    -- CTAS 1 is never in the waiting room.
    ctas                     smallint         NOT NULL CHECK (ctas BETWEEN 2 AND 5),
    complaint_group          complaint_group  NOT NULL,
    cedis_code               text             CHECK (cedis_code ~ '^[0-9]{3}$'),
    complaint_detail         text             CONSTRAINT visit_complaint_detail_check CHECK (
        complaint_detail IS NULL OR (
            complaint_group = 'general' AND char_length(complaint_detail) BETWEEN 1 AND 200
            AND complaint_detail ~ '[^[:space:]]'
        )
    ),
    -- Matches the contract's Language codes (api/src/recheck/contract/codes.py).
    language                 text             NOT NULL CHECK (language IN (
                                 'en', 'tl', 'pa', 'fr', 'es', 'de', 'yue', 'zh',
                                 'ar', 'ur', 'vi', 'ko', 'hi', 'ru', 'pl')),
    -- Set when the app is not offered: no channel, no QR, no prompts. The
    -- visit stays on the staff list and the staff timer still runs.
    app_exclusion            app_exclusion,
    channel                  channel          CHECK (channel IN ('phone', 'pager')),
    pager_no                 text             CHECK (pager_no ~ '^[0-9]{1,6}$'),
    -- One QR per app visit (phone is the fallback for pager patients). The
    -- person who scans it chooses patient or companion (FR11).
    token_hash               bytea            UNIQUE CHECK (octet_length(token_hash) = 32),
    token_ciphertext         bytea            CHECK (octet_length(token_ciphertext) BETWEEN 16 AND 512),
    triaged_at               timestamptz      NOT NULL DEFAULT now(),
    status                   visit_status     NOT NULL DEFAULT 'waiting',
    closed_at                timestamptz,
    -- Two independent timers. A patient report never moves the staff one.
    next_prompt_due_at       timestamptz,
    staff_reassess_due_at    timestamptz,
    last_staff_check_at      timestamptz,
    CONSTRAINT visit_pager_matches_channel CHECK ((channel = 'pager') = (pager_no IS NOT NULL)),
    -- An app visit has a channel and QR tokens. A visit without the app never
    -- has patient prompts. A visit excluded after enrolment keeps its channel
    -- and token history; visit_exclusion_guard handles that change.
    CONSTRAINT visit_app_offer CHECK (
        CASE WHEN app_exclusion IS NULL THEN
            num_nulls(channel, token_hash, token_ciphertext) = 0
        ELSE
            next_prompt_due_at IS NULL
        END
    ),
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
-- A visit without the app has no patient prompts, only the staff timer.
CREATE FUNCTION visit_set_first_due() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.app_exclusion IS NOT NULL
       AND num_nonnulls(NEW.channel, NEW.pager_no, NEW.token_hash, NEW.token_ciphertext) > 0 THEN
        RAISE EXCEPTION 'a visit enrolled without the app has no channel, pager or QR tokens'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.app_exclusion IS NULL THEN
        NEW.next_prompt_due_at := coalesce(NEW.next_prompt_due_at, NEW.triaged_at + ctas_interval(NEW.ctas));
    END IF;
    NEW.staff_reassess_due_at := coalesce(NEW.staff_reassess_due_at, NEW.triaged_at + ctas_interval(NEW.ctas));
    RETURN NEW;
END
$$;

CREATE TRIGGER visit_set_first_due
    BEFORE INSERT ON visit
    FOR EACH ROW EXECUTE FUNCTION visit_set_first_due();

-- Staff can stop offering the app after enrolment. The exclusion can't be
-- removed or changed once set. Patient prompts stop; the staff timer and the
-- token history stay.
CREATE FUNCTION visit_exclusion_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.app_exclusion IS NOT NULL AND NEW.app_exclusion IS DISTINCT FROM OLD.app_exclusion THEN
        RAISE EXCEPTION 'an app exclusion cannot be removed or changed' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.app_exclusion IS NOT NULL THEN
        NEW.next_prompt_due_at := NULL;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER visit_exclusion_guard
    BEFORE UPDATE ON visit
    FOR EACH ROW EXECUTE FUNCTION visit_exclusion_guard();

-- ---------------------------------------------------------------------------
-- visit_session: one device signed in to a visit as the patient or companion
--
-- Scanning the visit's QR and choosing a role creates a session. Only one
-- session per visit is open at a time. Signing in on a second device needs the
-- person to confirm the specific session they were shown; the server then
-- revokes that session (reason 'takeover') and inserts the new one, with
-- replaces = the old session, in the same transaction. If that session is no
-- longer open, or two sign-ins race, the unique index or the revoke matching
-- no row means the server answers 409 again rather than signing out someone
-- the person wasn't warned about.
--
-- Sessions have no expiry. They end when the visit closes or is excluded, on
-- takeover, or when the person or staff sign the device out. A report from a
-- signed-out device is rejected (report_session_open).
-- ---------------------------------------------------------------------------

CREATE TABLE visit_session (
    id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        uuid                NOT NULL REFERENCES visit (id),
    role            reporter            NOT NULL CHECK (role IN ('patient', 'companion')),
    session_hash    bytea               NOT NULL UNIQUE CHECK (octet_length(session_hash) = 32),
    created_at      timestamptz         NOT NULL DEFAULT now(),
    revoked_at      timestamptz,
    revoked_reason  session_end_reason,
    -- The session this one took over from, if any.
    replaces        uuid                UNIQUE REFERENCES visit_session (id),
    CONSTRAINT visit_session_revoked_shape CHECK (num_nonnulls(revoked_at, revoked_reason) IN (0, 2)),
    -- Lets a report reference (session, visit, role) so its reporter must match
    -- the role chosen at sign-in.
    CONSTRAINT visit_session_visit_role_uq UNIQUE (id, visit_id, role)
);

-- One signed-in device per visit.
CREATE UNIQUE INDEX visit_session_one_open_uq ON visit_session (visit_id) WHERE revoked_at IS NULL;

CREATE INDEX visit_session_visit_idx ON visit_session (visit_id, created_at DESC);

-- A session can only start on a waiting visit that offers the app. A session
-- that replaces another must replace one from the same visit that was revoked
-- for takeover.
CREATE FUNCTION visit_session_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- FOR SHARE blocks a concurrent close or exclusion until this sign-in
        -- commits, so the visit's revoke trigger always sees the new session.
        PERFORM FROM visit
        WHERE id = NEW.visit_id AND status = 'waiting' AND app_exclusion IS NULL
        FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'sign-in needs a waiting visit that offers the app' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.revoked_at IS NOT NULL THEN
            RAISE EXCEPTION 'a new session cannot start revoked' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.replaces IS NOT NULL AND NOT EXISTS (
            SELECT FROM visit_session
            WHERE id = NEW.replaces AND visit_id = NEW.visit_id AND revoked_reason = 'takeover'
        ) THEN
            RAISE EXCEPTION 'a session can only replace one from the same visit revoked for takeover'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
    -- Only revocation can change a session, once.
    IF OLD.revoked_at IS NOT NULL
       OR (NEW.id, NEW.visit_id, NEW.role, NEW.session_hash, NEW.created_at, NEW.replaces)
          IS DISTINCT FROM (OLD.id, OLD.visit_id, OLD.role, OLD.session_hash, OLD.created_at, OLD.replaces) THEN
        RAISE EXCEPTION 'a session can only be revoked, once' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER visit_session_check
    BEFORE INSERT OR UPDATE ON visit_session
    FOR EACH ROW EXECUTE FUNCTION visit_session_check();

-- Closing a visit or excluding it from the app signs out its device.
CREATE FUNCTION visit_revoke_sessions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE visit_session
    SET revoked_at = now(),
        revoked_reason = CASE WHEN NEW.app_exclusion IS NOT NULL AND OLD.app_exclusion IS NULL
                              THEN 'app_excluded'::session_end_reason
                              ELSE 'visit_closed'::session_end_reason END
    WHERE visit_id = NEW.id AND revoked_at IS NULL;
    RETURN NULL;
END
$$;

CREATE TRIGGER visit_revoke_sessions
    AFTER UPDATE OF app_exclusion, status ON visit
    FOR EACH ROW WHEN (
        (OLD.app_exclusion IS NULL AND NEW.app_exclusion IS NOT NULL)
        OR (OLD.status = 'waiting' AND NEW.status <> 'waiting')
    )
    EXECUTE FUNCTION visit_revoke_sessions();

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
-- push_subscription: a signed-in device's Web Push subscription
--
-- The browser hands the server an endpoint at its push service plus two keys
-- for encrypting messages. Recheck uses it only to remind the person that a
-- check-in is due. It belongs to one visit session: reminders go only while
-- that session is open, so takeover, sign-out, a closed visit or an app
-- exclusion stop them with no extra step. One open subscription per session;
-- a new one ends the old. A subscription can only be ended, once. The
-- endpoint and keys never reach the audit log.
-- ---------------------------------------------------------------------------

CREATE TYPE push_end_reason AS ENUM ('replaced', 'turned_off', 'gone');

CREATE TABLE push_subscription (
    id            uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    uuid             NOT NULL REFERENCES visit_session (id),
    -- Known push services only (checked by the API); always https.
    endpoint      text             NOT NULL CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 2048),
    -- Base64url P-256 public key (65 bytes) and auth secret (16 bytes).
    p256dh        text             NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
    auth          text             NOT NULL CHECK (auth ~ '^[A-Za-z0-9_-]{22}$'),
    created_at    timestamptz      NOT NULL DEFAULT now(),
    ended_at      timestamptz,
    ended_reason  push_end_reason,
    CONSTRAINT push_subscription_ended_shape CHECK (num_nonnulls(ended_at, ended_reason) IN (0, 2))
);

CREATE UNIQUE INDEX push_subscription_one_open_uq ON push_subscription (session_id) WHERE ended_at IS NULL;

-- A subscription starts only on an open session, and can only be ended, once.
CREATE FUNCTION push_subscription_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM FROM visit_session WHERE id = NEW.session_id AND revoked_at IS NULL FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'reminders need a signed-in device' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.ended_at IS NOT NULL THEN
            RAISE EXCEPTION 'a new push subscription cannot start ended' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.ended_at IS NOT NULL
       OR (NEW.id, NEW.session_id, NEW.endpoint, NEW.p256dh, NEW.auth, NEW.created_at)
          IS DISTINCT FROM (OLD.id, OLD.session_id, OLD.endpoint, OLD.p256dh, OLD.auth, OLD.created_at) THEN
        RAISE EXCEPTION 'a push subscription can only be ended, once' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER push_subscription_check
    BEFORE INSERT OR UPDATE ON push_subscription
    FOR EACH ROW EXECUTE FUNCTION push_subscription_check();

-- ---------------------------------------------------------------------------
-- push_send: one check-in reminder sent to one subscription
--
-- Reminders go at the patient prompt's due time and every 5 minutes after,
-- until the person checks in or one CTAS interval has passed. Slot n is the
-- reminder at due + 5n minutes. The scheduler claims a row before sending, so
-- each (visit, due time, slot) goes out at most once even with several API
-- processes. The result is filled in once after the push service answers.
-- Not audited: this table is itself the log, and auditing would double it.
-- ---------------------------------------------------------------------------

CREATE TYPE push_outcome AS ENUM ('sent', 'gone', 'failed');

CREATE TABLE push_send (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id         uuid          NOT NULL REFERENCES visit (id),
    subscription_id  uuid          NOT NULL REFERENCES push_subscription (id),
    due_at           timestamptz   NOT NULL,
    slot             smallint      NOT NULL CHECK (slot >= 0),
    claimed_at       timestamptz   NOT NULL DEFAULT now(),
    finished_at      timestamptz,
    outcome          push_outcome,
    -- The push service's HTTP status, when it answered.
    status_code      smallint      CHECK (status_code BETWEEN 100 AND 599),
    CONSTRAINT push_send_once UNIQUE (visit_id, due_at, slot),
    CONSTRAINT push_send_finished_shape CHECK (num_nonnulls(finished_at, outcome) IN (0, 2))
);

CREATE INDEX push_send_subscription_idx ON push_send (subscription_id);

-- The outcome is written once; nothing else changes.
CREATE FUNCTION push_send_finish_once() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.finished_at IS NOT NULL
       OR (NEW.id, NEW.visit_id, NEW.subscription_id, NEW.due_at, NEW.slot, NEW.claimed_at)
          IS DISTINCT FROM (OLD.id, OLD.visit_id, OLD.subscription_id, OLD.due_at, OLD.slot, OLD.claimed_at) THEN
        RAISE EXCEPTION 'a push send only records its outcome, once' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER push_send_finish_once
    BEFORE UPDATE ON push_send
    FOR EACH ROW EXECUTE FUNCTION push_send_finish_once();

-- ---------------------------------------------------------------------------
-- attention_prompt: the circle-counting check issued for one patient check-in
-- The server picks the sequence and keeps it here so it can score the answer.
-- Not a clinical test: a wrong or missing count only asks staff to check the
-- patient in person.
-- ---------------------------------------------------------------------------

CREATE TABLE attention_prompt (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id           uuid         NOT NULL REFERENCES visit (id),
    questionnaire_version text      NOT NULL,
    issued_at          timestamptz  NOT NULL DEFAULT now(),
    expires_at         timestamptz  NOT NULL,
    -- [{"shape": "circle" | "square", "x": 0..1, "y": 0..1}, ...]
    steps              jsonb        NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) > 0),
    show_ms            integer      NOT NULL CHECK (show_ms >= 200),
    gap_ms             integer      NOT NULL CHECK (gap_ms >= 0),
    expected_count     smallint     NOT NULL CHECK (expected_count BETWEEN 0 AND 20),
    CONSTRAINT attention_prompt_expires_after_issue CHECK (expires_at > issued_at),
    -- Lets a report reference (prompt, visit) so it can't use another visit's prompt.
    CONSTRAINT attention_prompt_visit_uq UNIQUE (id, visit_id)
);

CREATE INDEX attention_prompt_visit_idx ON attention_prompt (visit_id, issued_at DESC);

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
    feeling_now            feeling_now,
    feeling_now_missing    missing_reason,
    feeling_change         feeling_change,
    feeling_change_missing missing_reason,
    pain                   smallint         CHECK (pain BETWEEN 0 AND 10),
    pain_missing           missing_reason,
    findings               finding_code[],
    findings_missing       missing_reason,
    -- Circle-counting check: the prompt shown (kept even if unanswered) and the
    -- count given. Expiry and single use are checked by the server.
    attention_prompt_id    uuid,
    attention_count        smallint         CHECK (attention_count BETWEEN 0 AND 20),
    attention_missing      missing_reason,
    -- Complaint-specific answers keyed by question bank item key (FR6).
    items                  jsonb            NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(items) = 'object'),
    concern                concern_code,
    -- The phone session that sent it. The database checks the reporter matches
    -- the role chosen at sign-in. Pager and desk reports have no session.
    session_id             uuid,
    -- Staff flag only.
    note                   text             CHECK (char_length(note) BETWEEN 1 AND 280),
    entered_by             text,
    PRIMARY KEY (id, received_at),
    CONSTRAINT report_attention_prompt_fk FOREIGN KEY (attention_prompt_id, visit_id)
        REFERENCES attention_prompt (id, visit_id),
    CONSTRAINT report_session_fk FOREIGN KEY (session_id, visit_id, reporter)
        REFERENCES visit_session (id, visit_id, role),
    CONSTRAINT report_session_for_phone CHECK ((channel = 'phone') = (session_id IS NOT NULL)),
    CONSTRAINT report_staff_only_from_desk CHECK (
        (reporter = 'staff') = (channel = 'desk')
        AND (reporter = 'staff') = (kind = 'staff_flag')
        AND (reporter = 'staff') = (entered_by IS NOT NULL)
    ),
    CONSTRAINT report_checkin_shape CHECK (
        CASE WHEN kind = 'checkin' THEN
            questionnaire_version IS NOT NULL
            AND num_nonnulls(feeling_now, feeling_now_missing) = 1
            AND num_nonnulls(feeling_change, feeling_change_missing) = 1
            AND num_nonnulls(pain, pain_missing) = 1
            AND num_nonnulls(findings, findings_missing) = 1
            AND num_nonnulls(attention_count, attention_missing) = 1
            AND (attention_count IS NULL OR attention_prompt_id IS NOT NULL)
            -- Pain and the attention check are the patient's own.
            AND (reporter <> 'companion' OR num_nonnulls(pain, attention_count, attention_prompt_id) = 0)
        ELSE
            num_nonnulls(questionnaire_version, feeling_now, feeling_now_missing, feeling_change,
                         feeling_change_missing, pain, pain_missing, findings_missing,
                         attention_prompt_id, attention_count, attention_missing) = 0
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

-- A signed-out device can't report. FOR SHARE holds off a concurrent sign-out
-- or takeover until this report commits.
CREATE FUNCTION report_session_open() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.session_id IS NOT NULL THEN
        PERFORM FROM visit_session WHERE id = NEW.session_id AND revoked_at IS NULL FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'this device was signed out; reports from it are not accepted'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER report_session_open
    BEFORE INSERT ON report
    FOR EACH ROW EXECUTE FUNCTION report_session_open();

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
-- Department wait estimates from the AHS public feed (demo only)
-- wait_site maps a Recheck site to one AHS department. The poller
-- (api/src/recheck/wait_times/poller.py) stores one wait_snapshot per mapped
-- site every five minutes, including failed attempts, so gaps in the trend
-- are explained. The AHS figure is facility-wide (triage to physician for a
-- new mid-acuity arrival), not a patient's remaining wait.
-- ---------------------------------------------------------------------------

-- ok: AHS gave a value. unavailable: AHS marked the site unavailable, the
-- text was unreadable or the site was missing. fetch_failed: the feed could
-- not be fetched or parsed.
CREATE TYPE wait_fetch_status AS ENUM ('ok', 'unavailable', 'fetch_failed');

CREATE TABLE wait_site (
    site_id         text         PRIMARY KEY CHECK (site_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
    -- Matched against the feed: city key, facility Name and, for a facility
    -- with separate departments, its SplitFacility label (e.g. 'Adult emergency').
    ahs_city        text         NOT NULL CHECK (ahs_city <> ''),
    ahs_name        text         NOT NULL CHECK (ahs_name <> ''),
    ahs_department  text         CHECK (ahs_department <> ''),
    created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE wait_snapshot (
    site_id     text               NOT NULL REFERENCES wait_site (site_id),
    fetched_at  timestamptz        NOT NULL DEFAULT now(),
    status      wait_fetch_status  NOT NULL,
    minutes     integer            CHECK (minutes BETWEEN 0 AND 2880),
    -- The WaitTime text as AHS sent it, kept to debug parsing.
    raw_text    text               CHECK (length(raw_text) <= 200),
    detail      text               CHECK (length(detail) <= 500),
    PRIMARY KEY (site_id, fetched_at),
    CONSTRAINT wait_snapshot_minutes_iff_ok CHECK ((status = 'ok') = (minutes IS NOT NULL))
);

SELECT create_hypertable('wait_snapshot', by_range('fetched_at', interval '7 days'));

-- ---------------------------------------------------------------------------
-- site_setting: switches the triage nurse can change for the whole site
-- A site with no row uses the defaults. show_triage_level lets patients see
-- the level set at triage, in plain words (docs/research §4a). It is off by
-- default because no public AHS policy says staff share it.
-- ---------------------------------------------------------------------------

CREATE TABLE site_setting (
    site_id            text         PRIMARY KEY CHECK (site_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
    show_triage_level  boolean      NOT NULL DEFAULT false,
    updated_at         timestamptz  NOT NULL DEFAULT now()
);

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
-- TG_TABLE_NAME is the internal chunk. Token hashes, encrypted tokens,
-- session hashes and push endpoints and keys are left out.
CREATE FUNCTION audit_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log (actor, event, payload)
    VALUES (
        current_actor(),
        TG_ARGV[0] || '.' || lower(TG_OP),
        to_jsonb(NEW) - 'token_hash' - 'token_ciphertext' - 'session_hash' - 'fingerprint'
            - 'endpoint' - 'p256dh' - 'auth'
    );
    RETURN NEW;
END
$$;

-- Staff re-showing a visit's QR decrypts a live credential, so the API logs
-- each re-show through this function in the same transaction as the read.
CREATE FUNCTION log_qr_shown(visit uuid) RETURNS void
LANGUAGE sql AS $$
    INSERT INTO audit_log (actor, event, payload)
    VALUES (current_actor(), 'visit.qr_shown', jsonb_build_object('visit_id', visit));
$$;

CREATE TRIGGER visit_audit         AFTER INSERT OR UPDATE ON visit         FOR EACH ROW EXECUTE FUNCTION audit_write('visit');
CREATE TRIGGER visit_session_audit AFTER INSERT OR UPDATE ON visit_session FOR EACH ROW EXECUTE FUNCTION audit_write('visit_session');
CREATE TRIGGER attention_prompt_audit AFTER INSERT ON attention_prompt    FOR EACH ROW EXECUTE FUNCTION audit_write('attention_prompt');
CREATE TRIGGER report_audit        AFTER INSERT ON report                  FOR EACH ROW EXECUTE FUNCTION audit_write('report');
CREATE TRIGGER vitals_audit        AFTER INSERT ON vitals                  FOR EACH ROW EXECUTE FUNCTION audit_write('vitals');
CREATE TRIGGER task_audit          AFTER INSERT OR UPDATE ON task          FOR EACH ROW EXECUTE FUNCTION audit_write('task');
CREATE TRIGGER task_reason_audit   AFTER INSERT ON task_reason             FOR EACH ROW EXECUTE FUNCTION audit_write('task_reason');
-- Site mapping changes are audited. wait_snapshot is not: it is already an
-- append-only log of each fetch, and auditing it would double every poll.
CREATE TRIGGER wait_site_audit     AFTER INSERT OR UPDATE ON wait_site     FOR EACH ROW EXECUTE FUNCTION audit_write('wait_site');
CREATE TRIGGER site_setting_audit  AFTER INSERT OR UPDATE ON site_setting  FOR EACH ROW EXECUTE FUNCTION audit_write('site_setting');
CREATE TRIGGER push_subscription_audit AFTER INSERT OR UPDATE ON push_subscription FOR EACH ROW EXECUTE FUNCTION audit_write('push_subscription');

-- Append-only tables: no UPDATE, DELETE or TRUNCATE for anyone.
-- Row triggers don't fire on TRUNCATE, so it gets a statement trigger.
CREATE TRIGGER attention_prompt_append_only BEFORE UPDATE OR DELETE ON attention_prompt FOR EACH ROW EXECUTE FUNCTION block_change('attention_prompt');
CREATE TRIGGER report_append_only      BEFORE UPDATE OR DELETE ON report      FOR EACH ROW EXECUTE FUNCTION block_change('report');
CREATE TRIGGER vitals_append_only      BEFORE UPDATE OR DELETE ON vitals      FOR EACH ROW EXECUTE FUNCTION block_change('vitals');
CREATE TRIGGER task_reason_append_only BEFORE UPDATE OR DELETE ON task_reason FOR EACH ROW EXECUTE FUNCTION block_change('task_reason');
CREATE TRIGGER submission_append_only  BEFORE UPDATE OR DELETE ON submission  FOR EACH ROW EXECUTE FUNCTION block_change('submission');
CREATE TRIGGER audit_log_append_only   BEFORE UPDATE OR DELETE ON audit_log   FOR EACH ROW EXECUTE FUNCTION block_change('audit_log');
CREATE TRIGGER wait_snapshot_append_only BEFORE UPDATE OR DELETE ON wait_snapshot FOR EACH ROW EXECUTE FUNCTION block_change('wait_snapshot');
CREATE TRIGGER wait_site_no_delete     BEFORE DELETE ON wait_site     FOR EACH ROW EXECUTE FUNCTION block_change('wait_site');
CREATE TRIGGER site_setting_no_delete  BEFORE DELETE ON site_setting  FOR EACH ROW EXECUTE FUNCTION block_change('site_setting');

-- Records that change state are kept, never deleted.
CREATE TRIGGER visit_no_delete         BEFORE DELETE ON visit         FOR EACH ROW EXECUTE FUNCTION block_change('visit');
CREATE TRIGGER visit_session_no_delete BEFORE DELETE ON visit_session FOR EACH ROW EXECUTE FUNCTION block_change('visit_session');
CREATE TRIGGER task_no_delete          BEFORE DELETE ON task          FOR EACH ROW EXECUTE FUNCTION block_change('task');
CREATE TRIGGER push_subscription_no_delete BEFORE DELETE ON push_subscription FOR EACH ROW EXECUTE FUNCTION block_change('push_subscription');
CREATE TRIGGER push_send_no_delete     BEFORE DELETE ON push_send     FOR EACH ROW EXECUTE FUNCTION block_change('push_send');

CREATE TRIGGER visit_no_truncate         BEFORE TRUNCATE ON visit         FOR EACH STATEMENT EXECUTE FUNCTION block_change('visit');
CREATE TRIGGER visit_session_no_truncate BEFORE TRUNCATE ON visit_session FOR EACH STATEMENT EXECUTE FUNCTION block_change('visit_session');
CREATE TRIGGER submission_no_truncate    BEFORE TRUNCATE ON submission    FOR EACH STATEMENT EXECUTE FUNCTION block_change('submission');
CREATE TRIGGER attention_prompt_no_truncate BEFORE TRUNCATE ON attention_prompt FOR EACH STATEMENT EXECUTE FUNCTION block_change('attention_prompt');
CREATE TRIGGER report_no_truncate        BEFORE TRUNCATE ON report        FOR EACH STATEMENT EXECUTE FUNCTION block_change('report');
CREATE TRIGGER vitals_no_truncate        BEFORE TRUNCATE ON vitals        FOR EACH STATEMENT EXECUTE FUNCTION block_change('vitals');
CREATE TRIGGER task_no_truncate          BEFORE TRUNCATE ON task          FOR EACH STATEMENT EXECUTE FUNCTION block_change('task');
CREATE TRIGGER task_reason_no_truncate   BEFORE TRUNCATE ON task_reason   FOR EACH STATEMENT EXECUTE FUNCTION block_change('task_reason');
CREATE TRIGGER audit_log_no_truncate     BEFORE TRUNCATE ON audit_log     FOR EACH STATEMENT EXECUTE FUNCTION block_change('audit_log');
CREATE TRIGGER wait_site_no_truncate     BEFORE TRUNCATE ON wait_site     FOR EACH STATEMENT EXECUTE FUNCTION block_change('wait_site');
CREATE TRIGGER wait_snapshot_no_truncate BEFORE TRUNCATE ON wait_snapshot FOR EACH STATEMENT EXECUTE FUNCTION block_change('wait_snapshot');
CREATE TRIGGER site_setting_no_truncate  BEFORE TRUNCATE ON site_setting  FOR EACH STATEMENT EXECUTE FUNCTION block_change('site_setting');
CREATE TRIGGER push_subscription_no_truncate BEFORE TRUNCATE ON push_subscription FOR EACH STATEMENT EXECUTE FUNCTION block_change('push_subscription');
CREATE TRIGGER push_send_no_truncate     BEFORE TRUNCATE ON push_send     FOR EACH STATEMENT EXECUTE FUNCTION block_change('push_send');

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

REVOKE ALL ON visit, visit_session, submission, attention_prompt, report, vitals, task, task_reason, audit_log FROM PUBLIC, recheck_app;
GRANT SELECT, INSERT ON visit, visit_session, submission, attention_prompt, report, vitals, task, task_reason, audit_log TO recheck_app;
GRANT UPDATE ON visit, visit_session, task TO recheck_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO recheck_app;

-- The API reads wait estimates; site mappings are changed by an admin.
REVOKE ALL ON wait_site, wait_snapshot FROM PUBLIC, recheck_app;
GRANT SELECT ON wait_site, wait_snapshot TO recheck_app;

-- The triage nurse changes site settings through the API.
REVOKE ALL ON site_setting FROM PUBLIC, recheck_app;
GRANT SELECT, INSERT, UPDATE ON site_setting TO recheck_app;

-- Check-in reminders: a device saves and ends its subscription; the scheduler
-- claims each send and records its outcome. Both triggers limit the updates.
REVOKE ALL ON push_subscription, push_send FROM PUBLIC, recheck_app;
GRANT SELECT, INSERT, UPDATE ON push_subscription, push_send TO recheck_app;

-- Poller role: reads the site map and inserts snapshots, nothing else. It is
-- created without a password; give it one by hand, outside Git:
--   ALTER ROLE recheck_poller WITH LOGIN PASSWORD '...';
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'recheck_poller') THEN
        CREATE ROLE recheck_poller NOLOGIN;
    END IF;
END
$$;

REVOKE ALL ON wait_site, wait_snapshot FROM recheck_poller;
GRANT SELECT ON wait_site TO recheck_poller;
GRANT SELECT, INSERT ON wait_snapshot TO recheck_poller;

COMMIT;
