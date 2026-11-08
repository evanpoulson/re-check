-- Adds check-in reminders (Web Push) to a database built from an earlier
-- db/schema.sql. A fresh database gets them from schema.sql; run this once on
-- an existing one, before deploying the API that sends reminders:
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/migrations/2026-11-08-push-reminders.sql

BEGIN;

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

-- Push endpoints and keys never reach the audit log.
CREATE OR REPLACE FUNCTION audit_write() RETURNS trigger
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

CREATE TRIGGER push_subscription_audit       AFTER INSERT OR UPDATE ON push_subscription FOR EACH ROW EXECUTE FUNCTION audit_write('push_subscription');
CREATE TRIGGER push_subscription_no_delete   BEFORE DELETE ON push_subscription FOR EACH ROW EXECUTE FUNCTION block_change('push_subscription');
CREATE TRIGGER push_send_no_delete           BEFORE DELETE ON push_send FOR EACH ROW EXECUTE FUNCTION block_change('push_send');
CREATE TRIGGER push_subscription_no_truncate BEFORE TRUNCATE ON push_subscription FOR EACH STATEMENT EXECUTE FUNCTION block_change('push_subscription');
CREATE TRIGGER push_send_no_truncate         BEFORE TRUNCATE ON push_send FOR EACH STATEMENT EXECUTE FUNCTION block_change('push_send');

REVOKE ALL ON push_subscription, push_send FROM PUBLIC, recheck_app;
GRANT SELECT, INSERT, UPDATE ON push_subscription, push_send TO recheck_app;

COMMIT;
