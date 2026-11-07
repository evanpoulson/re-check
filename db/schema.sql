-- Recheck database schema (Tiger Data / TimescaleDB)
--
-- Source: Recheck PRD, "Architecture and data model" (Nov 7, 2026).
-- Tables: visit, checkin, vitals, alert, audit_log.
--
-- Time-series tables (checkin, vitals, audit_log) are hypertables partitioned
-- on their timestamp. Hypertable primary keys must include the time column,
-- so their PKs are (id, at).
--
-- Every insert/update on visit, checkin, vitals and alert is written to
-- audit_log by trigger. audit_log itself is append-only: UPDATE and DELETE
-- are blocked by trigger.
--
-- Set the acting user per transaction so the audit log records who did it:
--   SET LOCAL app.actor = 'auth0|abc123';
-- Falls back to the database role when unset.

BEGIN;

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------

CREATE TYPE visit_status AS ENUM ('waiting', 'roomed', 'left', 'discharged');

CREATE TYPE checkin_source AS ENUM ('phone', 'pager', 'voice', 'companion', 'nurse');

-- "Better / same / worse than at triage" (FR5)
CREATE TYPE checkin_overall AS ENUM ('better', 'same', 'worse');

-- Escalation levels (PRD "Escalation rules")
CREATE TYPE alert_level AS ENUM (
    'red',
    'red_escalated',
    'amber',
    'silent',
    'leave_risk',
    'overdue'
);

CREATE TYPE alert_route AS ENUM ('physician', 'charge_nurse', 'triage_board');

-- Acknowledgement actions (FR16)
CREATE TYPE ack_action AS ENUM (
    'assessed_stable',
    'tests_ordered',
    're_triaged',
    'roomed',
    'treated_and_released'
);

-- ---------------------------------------------------------------------------
-- visit: one ER waiting-room stay (FR1 to FR3)
-- No name or health number is ever stored; a visit is identified by its
-- one-time token (phone) or pager number.
-- ---------------------------------------------------------------------------

CREATE TABLE visit (
    id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    token            text         UNIQUE,
    pager_no         text,
    ctas             smallint     NOT NULL CHECK (ctas BETWEEN 1 AND 5),
    complaint_group  text         NOT NULL,
    language         text         NOT NULL DEFAULT 'en',
    triaged_at       timestamptz  NOT NULL DEFAULT now(),
    next_due_at      timestamptz,
    status           visit_status NOT NULL DEFAULT 'waiting',
    CONSTRAINT visit_has_channel CHECK (token IS NOT NULL OR pager_no IS NOT NULL)
);

-- A physical pager can only be bound to one waiting patient at a time.
CREATE UNIQUE INDEX visit_pager_waiting_uq
    ON visit (pager_no)
    WHERE status = 'waiting' AND pager_no IS NOT NULL;

CREATE INDEX visit_waiting_due_idx
    ON visit (next_due_at)
    WHERE status = 'waiting';

-- CTAS re-check interval (FR4). Placeholder defaults for clinical review.
CREATE FUNCTION ctas_interval(level smallint) RETURNS interval
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE level
        WHEN 1 THEN interval '5 minutes'
        WHEN 2 THEN interval '15 minutes'
        WHEN 3 THEN interval '30 minutes'
        WHEN 4 THEN interval '60 minutes'
        WHEN 5 THEN interval '120 minutes'
    END
$$;

-- Fill next_due_at from the CTAS schedule when the nurse creates a visit.
CREATE FUNCTION visit_set_first_due() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.next_due_at IS NULL THEN
        NEW.next_due_at := NEW.triaged_at + ctas_interval(NEW.ctas);
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER visit_set_first_due
    BEFORE INSERT ON visit
    FOR EACH ROW EXECUTE FUNCTION visit_set_first_due();

-- ---------------------------------------------------------------------------
-- checkin: every input path writes this same record (hypertable)
-- ---------------------------------------------------------------------------

CREATE TABLE checkin (
    id         bigint GENERATED ALWAYS AS IDENTITY,
    visit_id   uuid            NOT NULL REFERENCES visit (id),
    at         timestamptz     NOT NULL DEFAULT now(),
    source     checkin_source  NOT NULL,
    overall    checkin_overall,
    pain       smallint        CHECK (pain BETWEEN 0 AND 10),
    -- Warning signs (FR5), companion reports (FR11), and intent signals (FR7, FR9).
    signs      text[]          NOT NULL DEFAULT '{}',
    -- Complaint-specific answers from the fixed question bank (FR6),
    -- e.g. {"pain_spreading": true, "sweating": false}.
    answers    jsonb           NOT NULL DEFAULT '{}',
    -- Voice answers are unconfirmed until the patient presses the button (FR12).
    -- Unconfirmed check-ins must never trigger a rule.
    confirmed  boolean         NOT NULL DEFAULT true,
    PRIMARY KEY (id, at),
    CONSTRAINT checkin_signs_known CHECK (signs <@ ARRAY[
        'chest_pain',
        'trouble_breathing',
        'new_confusion',
        'fainting',
        'new_weakness_numbness',
        'heavy_bleeding',
        'vomiting',
        'worst_headache',
        'worried',
        'drowsiness',
        'help_now',
        'leaving'
    ]::text[])
);

SELECT create_hypertable('checkin', by_range('at', interval '1 day'));

CREATE INDEX checkin_visit_at_idx ON checkin (visit_id, at DESC);

-- ---------------------------------------------------------------------------
-- vitals: nurse-entered repeat vitals (FR17) (hypertable)
-- ---------------------------------------------------------------------------

CREATE TABLE vitals (
    id          bigint GENERATED ALWAYS AS IDENTITY,
    visit_id    uuid         NOT NULL REFERENCES visit (id),
    at          timestamptz  NOT NULL DEFAULT now(),
    sbp         smallint     CHECK (sbp BETWEEN 0 AND 400),
    dbp         smallint     CHECK (dbp BETWEEN 0 AND 300),
    hr          smallint     CHECK (hr BETWEEN 0 AND 350),
    spo2        smallint     CHECK (spo2 BETWEEN 0 AND 100),
    entered_by  text         NOT NULL,
    PRIMARY KEY (id, at)
);

SELECT create_hypertable('vitals', by_range('at', interval '1 day'));

CREATE INDEX vitals_visit_at_idx ON vitals (visit_id, at DESC);

-- ---------------------------------------------------------------------------
-- alert: escalations produced by the rules engine and timers
-- Regular table (not a hypertable) because alerts are updated when acknowledged.
-- ---------------------------------------------------------------------------

CREATE TABLE alert (
    id          bigint       PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    visit_id    uuid         NOT NULL REFERENCES visit (id),
    level       alert_level  NOT NULL,
    reason      text         NOT NULL,
    routed_to   alert_route  NOT NULL,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    acked_by    text,
    acked_at    timestamptz,
    action      ack_action,
    CONSTRAINT alert_ack_complete CHECK (
        (acked_by IS NULL AND acked_at IS NULL AND action IS NULL)
        OR (acked_by IS NOT NULL AND acked_at IS NOT NULL AND action IS NOT NULL)
    )
);

CREATE INDEX alert_visit_created_idx ON alert (visit_id, created_at DESC);

-- Open alerts drive the physician and charge nurse views.
CREATE INDEX alert_open_idx ON alert (routed_to, created_at) WHERE acked_at IS NULL;

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

CREATE FUNCTION audit_log_block_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER audit_log_no_update_delete
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();

-- Write one audit row per insert/update on the clinical tables.
-- event is "<table>.<op>", e.g. "alert.update". The table name is passed as a
-- trigger argument because on hypertables TG_TABLE_NAME is the internal chunk.
CREATE FUNCTION audit_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO audit_log (actor, event, payload)
    VALUES (
        coalesce(nullif(current_setting('app.actor', true), ''), current_user),
        TG_ARGV[0] || '.' || lower(TG_OP),
        to_jsonb(NEW)
    );
    RETURN NEW;
END
$$;

CREATE TRIGGER visit_audit   AFTER INSERT OR UPDATE ON visit   FOR EACH ROW EXECUTE FUNCTION audit_write('visit');
CREATE TRIGGER checkin_audit AFTER INSERT OR UPDATE ON checkin FOR EACH ROW EXECUTE FUNCTION audit_write('checkin');
CREATE TRIGGER vitals_audit  AFTER INSERT OR UPDATE ON vitals  FOR EACH ROW EXECUTE FUNCTION audit_write('vitals');
CREATE TRIGGER alert_audit   AFTER INSERT OR UPDATE ON alert   FOR EACH ROW EXECUTE FUNCTION audit_write('alert');

COMMIT;
