-- Behaviour checks for db/schema.sql. Runs as the app role inside one
-- transaction and rolls back, so it leaves no data behind.
--
--   psql -v ON_ERROR_STOP=1 -f db/tests/schema_checks.sql
--
-- Prints "schema checks passed" or stops at the first failing check.

BEGIN;

CREATE FUNCTION pg_temp.expect_error(stmt text, pattern text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION 'expected an error matching "%" from: %', pattern, stmt;
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected an error%' OR SQLERRM !~* pattern THEN
        RAISE;
    END IF;
END
$$;

SET LOCAL ROLE recheck_app;

-- Writes without an actor fail.
SELECT pg_temp.expect_error(
    $q$INSERT INTO visit (site_id, ctas, complaint_group, language, channel, patient_token_hash, companion_token_hash, tokens_expire_at)
       VALUES ('demo', 3, 'general', 'en', 'phone', sha256('a'), sha256('b'), now() + interval '1 day')$q$,
    'app.actor is not set');

SET LOCAL app.actor = 'test|nurse';

-- CTAS 1 is rejected.
SELECT pg_temp.expect_error(
    $q$INSERT INTO visit (site_id, ctas, complaint_group, language, channel, patient_token_hash, companion_token_hash, tokens_expire_at)
       VALUES ('demo', 1, 'general', 'en', 'phone', sha256('c'), sha256('d'), now() + interval '1 day')$q$,
    'visit_ctas_check');

INSERT INTO visit (id, site_id, ctas, complaint_group, language, channel, patient_token_hash, companion_token_hash, tokens_expire_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo', 3, 'chest_back_pain', 'en', 'phone',
        sha256('patient-token'), sha256('companion-token'), now() + interval '1 day');

-- Both timers start from the CTAS schedule.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM visit
        WHERE id = '00000000-0000-0000-0000-000000000001'
          AND next_prompt_due_at = triaged_at + interval '30 minutes'
          AND staff_reassess_due_at = triaged_at + interval '30 minutes'
    ) THEN
        RAISE EXCEPTION 'CTAS 3 timers were not set to 30 minutes';
    END IF;
END
$$;

-- Token hashes never reach the audit log.
DO $$
BEGIN
    IF EXISTS (SELECT FROM audit_log WHERE payload ?| ARRAY['patient_token_hash', 'companion_token_hash']) THEN
        RAISE EXCEPTION 'token hash leaked into audit_log';
    END IF;
    IF NOT EXISTS (SELECT FROM audit_log WHERE event = 'visit.insert' AND actor = 'test|nurse') THEN
        RAISE EXCEPTION 'visit insert was not audited with its actor';
    END IF;
END
$$;

-- A visit without the app: no channel, no QR, no patient prompts, staff timer still runs.
INSERT INTO visit (id, site_id, ctas, complaint_group, cedis_code, language, app_exclusion)
VALUES ('00000000-0000-0000-0000-000000000002', 'demo', 3, 'general', '458', 'en', 'pregnancy_over_20_weeks');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM visit
        WHERE id = '00000000-0000-0000-0000-000000000002'
          AND next_prompt_due_at IS NULL
          AND staff_reassess_due_at = triaged_at + interval '30 minutes'
    ) THEN
        RAISE EXCEPTION 'visit without the app should have only the staff timer';
    END IF;
END
$$;

SELECT pg_temp.expect_error(
    $q$INSERT INTO visit (site_id, ctas, complaint_group, language, app_exclusion, channel, patient_token_hash, companion_token_hash, tokens_expire_at)
       VALUES ('demo', 3, 'general', 'en', 'child', 'phone', sha256('e'), sha256('f'), now() + interval '1 day')$q$,
    'no channel, pager or QR tokens');
SELECT pg_temp.expect_error(
    $q$INSERT INTO visit (site_id, ctas, complaint_group, language)
       VALUES ('demo', 3, 'confused_drowsy', 'en')$q$,
    'visit_app_offer');

-- The circle-counting prompt the server issued for the first check-in.
INSERT INTO attention_prompt (id, visit_id, questionnaire_version, expires_at, steps, show_ms, gap_ms, expected_count)
VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 'demo-1',
        now() + interval '15 minutes',
        '[{"shape": "circle", "x": 0.2, "y": 0.3}, {"shape": "square", "x": 0.7, "y": 0.6}]', 1000, 500, 1);

SELECT pg_temp.expect_error($q$UPDATE attention_prompt SET expected_count = 2$q$, 'permission denied|append-only');

-- A prompt issued to the visit without the app, used to test cross-visit references.
INSERT INTO attention_prompt (id, visit_id, questionnaire_version, expires_at, steps, show_ms, gap_ms, expected_count)
VALUES ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000002', 'demo-1',
        now() + interval '15 minutes', '[{"shape": "circle", "x": 0.5, "y": 0.5}]', 1000, 500, 1);

-- A valid check-in, and shapes that must be rejected.
INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, questionnaire_version,
                    feeling_now, feeling_change, pain, findings, attention_prompt_id, attention_count)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', now(),
        'checkin', 'patient', 'phone', 'demo-1', 'poor', 'worse', 7, '{}', '00000000-0000-0000-0000-0000000000c1', 1);

-- A companion check-in: pain and the attention check are sent as missing.
INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, questionnaire_version,
                    feeling_now, feeling_change_missing, pain_missing, findings, attention_missing)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(),
        'checkin', 'companion', 'phone', 'demo-1', 'poor', 'unsure', 'not_asked', '{drowsiness}', 'not_asked');

SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, questionnaire_version, feeling_now, feeling_now_missing, feeling_change, pain, findings, attention_missing)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'checkin', 'patient', 'phone', 'demo-1', 'poor', 'unsure', 'worse', 7, '{}', 'not_reached')$q$,
    'report_checkin_shape');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, questionnaire_version, feeling_now, feeling_change, pain_missing, findings, attention_prompt_id, attention_count)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'checkin', 'companion', 'phone', 'demo-1', 'poor', 'worse', 'not_asked', '{}', '00000000-0000-0000-0000-0000000000c1', 1)$q$,
    'report_checkin_shape');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, questionnaire_version, feeling_now, feeling_change, pain, findings, attention_count)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'checkin', 'patient', 'phone', 'demo-1', 'poor', 'worse', 7, '{}', 1)$q$,
    'report_checkin_shape');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, questionnaire_version, feeling_now_missing, feeling_change, pain, findings, attention_missing)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'checkin', 'companion', 'phone', 'demo-1', 'not_asked', 'same', 5, '{}', 'not_asked')$q$,
    'report_checkin_shape');

INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, concern)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'concern', 'patient', 'phone', 'desk_question');

-- A prompt shown but not answered keeps its ID.
INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, questionnaire_version,
                    feeling_now, feeling_change, pain, findings, attention_prompt_id, attention_missing)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(),
        'checkin', 'patient', 'phone', 'demo-1', 'ok', 'same', 3, '{}', '00000000-0000-0000-0000-0000000000c1', 'unsure');

-- A report can't use another visit's prompt.
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, questionnaire_version, feeling_now, feeling_change, pain, findings, attention_prompt_id, attention_count)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'checkin', 'patient', 'phone', 'demo-1', 'ok', 'same', 3, '{}', '00000000-0000-0000-0000-0000000000c2', 1)$q$,
    'report_attention_prompt_fk');

-- Excluding a visit after enrolment stops prompts, signs out its devices and keeps token history.
INSERT INTO visit (id, site_id, ctas, complaint_group, language, channel, patient_token_hash, companion_token_hash, tokens_expire_at, patient_token_used_at)
VALUES ('00000000-0000-0000-0000-000000000003', 'demo', 4, 'general', 'en', 'phone',
        sha256('late-patient'), sha256('late-companion'), now() + interval '1 day', now());
INSERT INTO visit_session (visit_id, role, session_hash, expires_at)
VALUES ('00000000-0000-0000-0000-000000000003', 'patient', sha256('late-session'), now() + interval '1 day');

UPDATE visit SET app_exclusion = 'self_harm_or_violence' WHERE id = '00000000-0000-0000-0000-000000000003';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM visit
        WHERE id = '00000000-0000-0000-0000-000000000003'
          AND next_prompt_due_at IS NULL
          AND staff_reassess_due_at IS NOT NULL
          AND patient_token_used_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'late exclusion should stop prompts and keep the staff timer and token history';
    END IF;
    IF EXISTS (SELECT FROM visit_session WHERE visit_id = '00000000-0000-0000-0000-000000000003' AND revoked_at IS NULL) THEN
        RAISE EXCEPTION 'late exclusion should revoke the visit''s sessions';
    END IF;
END
$$;

SELECT pg_temp.expect_error(
    $q$UPDATE visit SET app_exclusion = NULL WHERE id = '00000000-0000-0000-0000-000000000003'$q$,
    'cannot be removed or changed');
-- A visit without the app can't be given a patient prompt.
UPDATE visit SET next_prompt_due_at = now() WHERE id = '00000000-0000-0000-0000-000000000002';
DO $$
BEGIN
    IF EXISTS (SELECT FROM visit WHERE id = '00000000-0000-0000-0000-000000000002' AND next_prompt_due_at IS NOT NULL) THEN
        RAISE EXCEPTION 'a visit without the app was given a patient prompt';
    END IF;
END
$$;
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'finding', 'companion', 'phone')$q$,
    'report_finding_shape');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, entered_by)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'staff_flag', 'staff', 'phone', 'test|nurse')$q$,
    'report_staff_only_from_desk');

INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, findings)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'finding', 'companion', 'pager', '{speech_change}');

-- Reports and vitals are append-only, even for the owner role's triggers.
SELECT pg_temp.expect_error($q$UPDATE report SET pain = 2$q$, 'permission denied|append-only');
SELECT pg_temp.expect_error($q$DELETE FROM report$q$, 'permission denied|append-only');
SELECT pg_temp.expect_error($q$TRUNCATE report$q$, 'permission denied|append-only');
SELECT pg_temp.expect_error($q$DELETE FROM visit$q$, 'permission denied|append-only');
SELECT pg_temp.expect_error($q$TRUNCATE audit_log$q$, 'permission denied|append-only');
SELECT pg_temp.expect_error($q$UPDATE audit_log SET actor = 'someone else'$q$, 'permission denied|append-only');

-- Vitals: at least one value, BP as a pair.
SELECT pg_temp.expect_error(
    $q$INSERT INTO vitals (id, visit_id, measured_at, entered_by, entered_by_role)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'test|nurse', 'triage_nurse')$q$,
    'vitals_has_value');
SELECT pg_temp.expect_error(
    $q$INSERT INTO vitals (id, visit_id, measured_at, sbp, entered_by, entered_by_role)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 210, 'test|nurse', 'triage_nurse')$q$,
    'vitals_bp_pair');
INSERT INTO vitals (id, visit_id, measured_at, sbp, dbp, entered_by, entered_by_role)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 210, 110, 'test|nurse', 'triage_nurse');

-- Tasks: one open per visit, escalate-only, ack separate from assess.
INSERT INTO task (id, visit_id, level, routed_to, ack_due_at)
VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', 'amber', '{physician}', now() + interval '15 minutes');

SELECT pg_temp.expect_error(
    $q$INSERT INTO task (visit_id, level, routed_to) VALUES ('00000000-0000-0000-0000-000000000001', 'red', '{physician}')$q$,
    'task_one_open_per_visit');

-- Level goes up, never down. Recipients are added, never removed.
UPDATE task SET level = 'red' WHERE id = '00000000-0000-0000-0000-0000000000b1';
SELECT pg_temp.expect_error(
    $q$UPDATE task SET level = 'amber' WHERE id = '00000000-0000-0000-0000-0000000000b1'$q$, 'cannot go down');
UPDATE task SET escalated = true, routed_to = '{physician,charge_nurse}' WHERE id = '00000000-0000-0000-0000-0000000000b1';
SELECT pg_temp.expect_error(
    $q$UPDATE task SET routed_to = '{charge_nurse}' WHERE id = '00000000-0000-0000-0000-0000000000b1'$q$, 'not removed');
SELECT pg_temp.expect_error(
    $q$UPDATE task SET escalated = false WHERE id = '00000000-0000-0000-0000-0000000000b1'$q$, 'cannot be undone');
SELECT pg_temp.expect_error(
    $q$UPDATE task SET ack_due_at = ack_due_at + interval '1 hour' WHERE id = '00000000-0000-0000-0000-0000000000b1'$q$,
    'cannot move later');

-- Acknowledge without assessing, then assess.
SELECT pg_temp.expect_error(
    $q$UPDATE task SET status = 'completed', acknowledged_at = now(), acknowledged_by = 'test|tlp', acknowledged_by_role = 'physician'
       WHERE id = '00000000-0000-0000-0000-0000000000b1'$q$,
    'task_status_matches_steps');
UPDATE task SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = 'test|tlp', acknowledged_by_role = 'physician'
WHERE id = '00000000-0000-0000-0000-0000000000b1';
SELECT pg_temp.expect_error(
    $q$UPDATE task SET acknowledged_by = 'test|someone_else' WHERE id = '00000000-0000-0000-0000-0000000000b1'$q$,
    'cannot be rewritten');
SELECT pg_temp.expect_error(
    $q$UPDATE task SET status = 'open', acknowledged_at = NULL, acknowledged_by = NULL, acknowledged_by_role = NULL
       WHERE id = '00000000-0000-0000-0000-0000000000b1'$q$,
    'cannot go back');
UPDATE task SET status = 'completed', assessed_at = now(), assessed_by = 'test|tlp', assessed_by_role = 'physician',
                disposition = 'assessed_stable'
WHERE id = '00000000-0000-0000-0000-0000000000b1';
SELECT pg_temp.expect_error(
    $q$UPDATE task SET level = 'red' WHERE id = '00000000-0000-0000-0000-0000000000b1'$q$, 'completed and cannot change');

-- A repeat concern after completion opens a new task.
INSERT INTO task (visit_id, level, routed_to) VALUES ('00000000-0000-0000-0000-000000000001', 'red', '{physician}');

-- task_reason is append-only.
INSERT INTO task_reason (task_id, rule_id, rule_version, level, reason_code, evidence)
VALUES ('00000000-0000-0000-0000-0000000000b1', 'worse_twice', 'demo-1', 'red', 'worse_twice_90_min',
        '[{"kind": "report", "id": "00000000-0000-0000-0000-0000000000a1"}]');
SELECT pg_temp.expect_error($q$UPDATE task_reason SET level = 'amber'$q$, 'permission denied|append-only');

-- Duplicate submission IDs are rejected.
INSERT INTO submission (id, actor, endpoint, fingerprint) VALUES ('00000000-0000-0000-0000-0000000000c1', 'test|nurse', 'report', sha256('x'));
SELECT pg_temp.expect_error(
    $q$INSERT INTO submission (id, actor, endpoint, fingerprint) VALUES ('00000000-0000-0000-0000-0000000000c1', 'test|nurse', 'report', sha256('y'))$q$,
    'submission_pkey');

RESET ROLE;

-- Append-only triggers hold even for the table owner.
SELECT pg_temp.expect_error($q$DELETE FROM report$q$, 'append-only');
SELECT pg_temp.expect_error($q$TRUNCATE audit_log$q$, 'append-only');

SELECT 'schema checks passed';

ROLLBACK;
