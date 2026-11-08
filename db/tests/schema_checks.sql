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
    $q$INSERT INTO visit (site_id, ctas, complaint_group, language, channel, token_hash, token_ciphertext)
       VALUES ('demo', 3, 'general', 'en', 'phone', sha256('a'), sha256('b'))$q$,
    'app.actor is not set');

SET LOCAL app.actor = 'test|nurse';

-- CTAS 1 is rejected.
SELECT pg_temp.expect_error(
    $q$INSERT INTO visit (site_id, ctas, complaint_group, language, channel, token_hash, token_ciphertext)
       VALUES ('demo', 1, 'general', 'en', 'phone', sha256('c'), sha256('d'))$q$,
    'visit_ctas_check');

INSERT INTO visit (id, site_id, ctas, complaint_group, language, channel, token_hash, token_ciphertext)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo', 3, 'chest_back_pain', 'en', 'phone',
        sha256('patient-token'), sha256('companion-token'));

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

-- One device signed in at a time. The patient signs in first.
INSERT INTO visit_session (id, visit_id, role, session_hash)
VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000001', 'patient', sha256('s1'));

SELECT pg_temp.expect_error(
    $q$INSERT INTO visit_session (visit_id, role, session_hash)
       VALUES ('00000000-0000-0000-0000-000000000001', 'companion', sha256('s-extra'))$q$,
    'visit_session_one_open_uq');

-- A second visit where the companion signed in, for companion reports.
INSERT INTO visit (id, site_id, ctas, complaint_group, language, channel, token_hash, token_ciphertext)
VALUES ('00000000-0000-0000-0000-000000000005', 'demo', 3, 'head_injury', 'en', 'phone', sha256('v5-token'), sha256('v5-cipher'));
INSERT INTO visit_session (id, visit_id, role, session_hash)
VALUES ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-000000000005', 'companion', sha256('s5'));

-- Tokens and session hashes never reach the audit log.
DO $$
BEGIN
    IF EXISTS (SELECT FROM audit_log WHERE payload ?| ARRAY['token_hash', 'token_ciphertext', 'session_hash']) THEN
        RAISE EXCEPTION 'token or session secret leaked into audit_log';
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
    $q$INSERT INTO visit (site_id, ctas, complaint_group, language, app_exclusion, channel, token_hash, token_ciphertext)
       VALUES ('demo', 3, 'general', 'en', 'child', 'phone', sha256('e'), sha256('f'))$q$,
    'no channel, pager or QR tokens');
SELECT pg_temp.expect_error(
    $q$INSERT INTO visit (site_id, ctas, complaint_group, language)
       VALUES ('demo', 3, 'confused_drowsy', 'en')$q$,
    'visit_app_offer');

-- No one can sign in to a visit without the app.
SELECT pg_temp.expect_error(
    $q$INSERT INTO visit_session (visit_id, role, session_hash)
       VALUES ('00000000-0000-0000-0000-000000000002', 'patient', sha256('s-excluded'))$q$,
    'waiting visit that offers the app');

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
INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, questionnaire_version,
                    feeling_now, feeling_change, pain, findings, attention_prompt_id, attention_count)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', now(),
        'checkin', 'patient', 'phone', '00000000-0000-0000-0000-0000000000d1', 'demo-1', 'poor', 'worse', 7, '{}', '00000000-0000-0000-0000-0000000000c1', 1);

-- A companion check-in: pain and the attention check are sent as missing.
INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, questionnaire_version,
                    feeling_now, feeling_change_missing, pain_missing, findings, attention_missing)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', now(),
        'checkin', 'companion', 'phone', '00000000-0000-0000-0000-0000000000d5', 'demo-1', 'poor', 'unsure', 'not_asked', '{drowsiness}', 'not_asked');

SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, questionnaire_version, feeling_now, feeling_now_missing, feeling_change, pain, findings, attention_missing)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'checkin', 'patient', 'phone', '00000000-0000-0000-0000-0000000000d1', 'demo-1', 'poor', 'unsure', 'worse', 7, '{}', 'not_reached')$q$,
    'report_checkin_shape');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, questionnaire_version, feeling_now, feeling_change, pain_missing, findings, attention_prompt_id, attention_count)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', now(), 'checkin', 'companion', 'phone', '00000000-0000-0000-0000-0000000000d5', 'demo-1', 'poor', 'worse', 'not_asked', '{}', '00000000-0000-0000-0000-0000000000c1', 1)$q$,
    'report_checkin_shape');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, questionnaire_version, feeling_now, feeling_change, pain, findings, attention_count)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'checkin', 'patient', 'phone', '00000000-0000-0000-0000-0000000000d1', 'demo-1', 'poor', 'worse', 7, '{}', 1)$q$,
    'report_checkin_shape');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, questionnaire_version, feeling_now_missing, feeling_change, pain, findings, attention_missing)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', now(), 'checkin', 'companion', 'phone', '00000000-0000-0000-0000-0000000000d5', 'demo-1', 'not_asked', 'same', 5, '{}', 'not_asked')$q$,
    'report_checkin_shape');

INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, concern)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'concern', 'patient', 'phone', '00000000-0000-0000-0000-0000000000d1', 'desk_question');

-- A phone report's reporter must match the role chosen at sign-in, and only phone reports have a session.
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, concern)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', now(), 'concern', 'patient', 'phone', '00000000-0000-0000-0000-0000000000d5', 'worried')$q$,
    'report_session_fk');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, concern)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'concern', 'patient', 'phone', NULL, 'worried')$q$,
    'report_session_for_phone');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, concern)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', now(), 'concern', 'companion', 'pager', '00000000-0000-0000-0000-0000000000d5', 'worried')$q$,
    'report_session_for_phone');

-- A prompt shown but not answered keeps its ID.
INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, questionnaire_version,
                    feeling_now, feeling_change, pain, findings, attention_prompt_id, attention_missing)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(),
        'checkin', 'patient', 'phone', '00000000-0000-0000-0000-0000000000d1', 'demo-1', 'ok', 'same', 3, '{}', '00000000-0000-0000-0000-0000000000c1', 'unsure');

-- A report can't use another visit's prompt.
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, questionnaire_version, feeling_now, feeling_change, pain, findings, attention_prompt_id, attention_count)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'checkin', 'patient', 'phone', '00000000-0000-0000-0000-0000000000d1', 'demo-1', 'ok', 'same', 3, '{}', '00000000-0000-0000-0000-0000000000c2', 1)$q$,
    'report_attention_prompt_fk');

-- Excluding a visit after enrolment stops prompts, signs out its devices and keeps token history.
INSERT INTO visit (id, site_id, ctas, complaint_group, language, channel, token_hash, token_ciphertext)
VALUES ('00000000-0000-0000-0000-000000000003', 'demo', 4, 'general', 'en', 'phone',
        sha256('late-token'), sha256('late-cipher'));
INSERT INTO visit_session (visit_id, role, session_hash)
VALUES ('00000000-0000-0000-0000-000000000003', 'patient', sha256('late-session'));

UPDATE visit SET app_exclusion = 'self_harm_or_violence' WHERE id = '00000000-0000-0000-0000-000000000003';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM visit
        WHERE id = '00000000-0000-0000-0000-000000000003'
          AND next_prompt_due_at IS NULL
          AND staff_reassess_due_at IS NOT NULL
          AND token_hash IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'late exclusion should stop prompts and keep the staff timer and token history';
    END IF;
    IF EXISTS (
        SELECT FROM visit_session
        WHERE visit_id = '00000000-0000-0000-0000-000000000003' AND revoked_reason IS DISTINCT FROM 'app_excluded'
    ) THEN
        RAISE EXCEPTION 'late exclusion should revoke the visit''s session as app_excluded';
    END IF;
END
$$;

SELECT pg_temp.expect_error(
    $q$UPDATE visit SET app_exclusion = NULL WHERE id = '00000000-0000-0000-0000-000000000003'$q$,
    'cannot be removed or changed');

-- Closing a visit signs out its device, and no one can sign in afterwards.
INSERT INTO visit (id, site_id, ctas, complaint_group, language, channel, token_hash, token_ciphertext)
VALUES ('00000000-0000-0000-0000-000000000004', 'demo', 5, 'general', 'en', 'phone',
        sha256('closed-token'), sha256('closed-cipher'));
INSERT INTO visit_session (visit_id, role, session_hash)
VALUES ('00000000-0000-0000-0000-000000000004', 'companion', sha256('closed-session'));
UPDATE visit SET status = 'roomed', closed_at = now() WHERE id = '00000000-0000-0000-0000-000000000004';
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM visit_session
        WHERE visit_id = '00000000-0000-0000-0000-000000000004' AND revoked_reason IS DISTINCT FROM 'visit_closed'
    ) THEN
        RAISE EXCEPTION 'closing a visit should revoke its session as visit_closed';
    END IF;
END
$$;
SELECT pg_temp.expect_error(
    $q$INSERT INTO visit_session (visit_id, role, session_hash)
       VALUES ('00000000-0000-0000-0000-000000000004', 'patient', sha256('late-sign-in'))$q$,
    'waiting visit that offers the app');
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
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', now(), 'finding', 'companion', 'phone', '00000000-0000-0000-0000-0000000000d5')$q$,
    'report_finding_shape');
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, entered_by)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'staff_flag', 'staff', 'pager', NULL, 'test|nurse')$q$,
    'report_staff_only_from_desk');

INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, findings)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'finding', 'companion', 'pager', NULL, '{speech_change}');

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

-- The companion confirms takeover of the patient's session on visit 1:
-- the patient's session is revoked, then the companion's starts.
UPDATE visit_session SET revoked_at = now(), revoked_reason = 'takeover' WHERE id = '00000000-0000-0000-0000-0000000000d1' AND revoked_at IS NULL;
INSERT INTO visit_session (id, visit_id, role, session_hash, replaces)
VALUES ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000001', 'companion', sha256('s2'), '00000000-0000-0000-0000-0000000000d1');

-- The signed-out patient phone can't report, even something it queued offline.
SELECT pg_temp.expect_error(
    $q$INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, concern)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now() - interval '5 minutes', 'concern', 'patient', 'phone', '00000000-0000-0000-0000-0000000000d1', 'help_now')$q$,
    'signed out');
INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, session_id, concern)
VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', now(), 'concern', 'companion', 'phone', '00000000-0000-0000-0000-0000000000d2', 'worried');

-- Revoking is one-way, and a revocation needs a reason.
SELECT pg_temp.expect_error(
    $q$UPDATE visit_session SET revoked_at = NULL, revoked_reason = NULL WHERE id = '00000000-0000-0000-0000-0000000000d1'$q$,
    'only be revoked, once');
SELECT pg_temp.expect_error(
    $q$UPDATE visit_session SET revoked_at = now() WHERE id = '00000000-0000-0000-0000-0000000000d2'$q$,
    'visit_session_revoked_shape');
-- A session can only replace one revoked for takeover on the same visit.
SELECT pg_temp.expect_error(
    $q$INSERT INTO visit_session (visit_id, role, session_hash, replaces)
       VALUES ('00000000-0000-0000-0000-000000000001', 'patient', sha256('s-bad'), '00000000-0000-0000-0000-0000000000d2')$q$,
    'same visit revoked for takeover');

-- The companion signs out; the patient can then sign in without a takeover.
UPDATE visit_session SET revoked_at = now(), revoked_reason = 'signed_out' WHERE id = '00000000-0000-0000-0000-0000000000d2';
INSERT INTO visit_session (id, visit_id, role, session_hash)
VALUES ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000001', 'patient', sha256('s3'));
-- Staff sign out the patient's device.
UPDATE visit_session SET revoked_at = now(), revoked_reason = 'staff_signed_out' WHERE id = '00000000-0000-0000-0000-0000000000d3';

-- Each takeover is audited, and each QR re-show is logged.
SELECT log_qr_shown('00000000-0000-0000-0000-000000000001');
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM audit_log WHERE event = 'visit_session.update' AND payload ->> 'revoked_reason' = 'takeover') THEN
        RAISE EXCEPTION 'takeover was not audited';
    END IF;
    IF NOT EXISTS (
        SELECT FROM audit_log
        WHERE event = 'visit.qr_shown' AND actor = 'test|nurse' AND payload ->> 'visit_id' = '00000000-0000-0000-0000-000000000001'
    ) THEN
        RAISE EXCEPTION 'QR re-show was not logged';
    END IF;
    IF EXISTS (SELECT FROM audit_log WHERE payload ?| ARRAY['token_hash', 'token_ciphertext', 'session_hash']) THEN
        RAISE EXCEPTION 'token or session secret leaked into audit_log';
    END IF;
END
$$;

RESET ROLE;

-- Append-only triggers hold even for the table owner.
SELECT pg_temp.expect_error($q$DELETE FROM report$q$, 'append-only');
SELECT pg_temp.expect_error($q$TRUNCATE audit_log$q$, 'append-only');

SELECT 'schema checks passed';

ROLLBACK;
