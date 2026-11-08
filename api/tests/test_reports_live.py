"""Patient reports, rules and tasks against the real database, rolled back after each test."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from recheck.question_bank import default_bank

pytestmark = pytest.mark.live

MISSING = {"kind": "missing", "reason": "unsure"}


def sid() -> str:
    return str(uuid4())


def now() -> str:
    return datetime.now(UTC).isoformat()


def query(client, sql, *params, one=True):
    async def run():
        async with client.app.state.pool.connection() as conn:
            cur = await conn.execute(sql, list(params))
            return await (cur.fetchone() if one else cur.fetchall())

    return client.portal.call(run)


def sign_in(client, *, role="patient", **visit):
    """Enrol a fresh visit as the triage nurse and sign a phone in to it. Returns the visit ID."""
    client.post("/api/staff/session", json={"role": "triage_nurse"})
    body = {"submission_id": sid(), "ctas": 3, "complaint_group": "chest_back_pain", "language": "en", "channel": "phone"}
    body.update(visit)
    enrolled = client.post("/api/visits", json=body)
    assert enrolled.status_code == 201, enrolled.text
    token = enrolled.json()["link"].rsplit("/v/", 1)[1]
    client.cookies.delete("recheck_session", path="/api")
    assert client.post("/api/session", json={"token": token, "role": role}).status_code == 200
    return enrolled.json()["visit_id"]


def checkin(*, change=None, findings=None, pain=None, attention=None, items=None, reporter="patient", **extra):
    return {
        "submission_id": sid(),
        "kind": "checkin",
        "reporter": reporter,
        "channel": "phone",
        "captured_at": now(),
        "questionnaire_version": default_bank().version,
        "feeling_now": {"kind": "answered", "value": "ok"},
        "feeling_change": {"kind": "answered", "value": change} if change else {"kind": "answered", "value": "same"},
        "pain": {"kind": "answered", "value": pain} if pain is not None else MISSING,
        "new_findings": {"kind": "answered", "value": findings or []},
        "attention": attention or {"kind": "missing", "reason": "not_asked"},
        "items": items or {},
        **extra,
    }


def post(client, body):
    return client.post("/api/patient/reports", json=body)


def open_task(client, visit_id):
    return query(
        client,
        "SELECT t.level::text, t.routed_to::text[], t.status::text, t.ack_due_at - t.created_at,"
        " array_agg(r.reason_code ORDER BY r.fired_at, r.reason_code)"
        " FROM task t JOIN task_reason r ON r.task_id = t.id"
        " WHERE t.visit_id = %s AND t.status <> 'completed' GROUP BY t.id",
        visit_id,
    )


# --- check-ins ---------------------------------------------------------------


def test_reassuring_checkin_raises_nothing_and_moves_only_the_patient_timer(live_client):
    visit = sign_in(live_client)
    fresh = query(live_client, "SELECT next_prompt_due_at FROM visit WHERE id = %s", visit)[0]

    # Tests share one transaction, so now() doesn't move; pretend the prompt is already overdue instead.
    async def make_overdue():
        async with live_client.app.state.pool.connection() as conn:
            await conn.execute("SELECT set_config('app.actor', 'test|clock', true)")
            await conn.execute(
                "UPDATE visit SET next_prompt_due_at = next_prompt_due_at - interval '45 minutes' WHERE id = %s", [visit]
            )

    live_client.portal.call(make_overdue)
    before = query(live_client, "SELECT next_prompt_due_at, staff_reassess_due_at FROM visit WHERE id = %s", visit)
    r = post(live_client, checkin(pain=3, items={"pain_moved": {"kind": "yes_no", "value": False}}))
    assert r.status_code == 200, r.text
    receipt = r.json()
    assert receipt["patient_message"] == "none" and receipt["duplicate"] is False
    assert "pain_moved" not in receipt["follow_up_items"]
    assert "pain_sudden_worse" in receipt["follow_up_items"]
    assert open_task(live_client, visit) is None
    after = query(live_client, "SELECT next_prompt_due_at, staff_reassess_due_at FROM visit WHERE id = %s", visit)
    assert after[0] == fresh != before[0], "patient prompt timer restarts a full CTAS interval from now"
    assert after[1] == before[1], "a report never moves the staff timer"
    stored = query(
        live_client, "SELECT pain, findings::text[], items->'pain_moved'->>'value' FROM report WHERE visit_id = %s", visit
    )
    assert stored == (3, [], "false")


def test_finding_opens_a_red_task_with_evidence(live_client):
    visit = sign_in(live_client)
    body = checkin(change="worse", findings=["chest_pain"])
    r = post(live_client, body)
    assert r.status_code == 200, r.text
    assert r.json()["patient_message"] == "clinician_will_check"
    level, routed, status, ack_window, reasons = open_task(live_client, visit)
    assert (level, routed, status) == ("red", ["physician"], "open")
    assert ack_window == timedelta(minutes=2)
    assert reasons == sorted(["finding_chest_pain", "feeling_worse"])
    evidence, version = query(
        live_client,
        "SELECT evidence, rule_version FROM task_reason r JOIN task t ON t.id = r.task_id"
        " WHERE t.visit_id = %s LIMIT 1",
        visit,
    )
    assert evidence == [{"kind": "report", "id": body["submission_id"]}]
    assert version == "2026-11-07.demo"


def test_later_reports_add_reasons_but_never_lower_the_task(live_client):
    visit = sign_in(live_client)
    post(live_client, checkin(change="much_worse"))  # red
    worried = {"submission_id": sid(), "kind": "concern", "concern": "worried",
               "reporter": "patient", "channel": "phone", "captured_at": now()}
    assert post(live_client, worried).json()["patient_message"] == "clinician_will_check"
    desk = {**worried, "submission_id": sid(), "concern": "desk_question"}
    assert post(live_client, desk).json()["patient_message"] == "none"
    post(live_client, checkin(change="better"))  # reassuring: nothing
    level, routed, _, _, reasons = open_task(live_client, visit)
    assert level == "red"
    assert sorted(routed) == ["physician", "triage_nurse"]
    assert sorted(reasons) == ["concern_desk_question", "concern_worried", "feeling_worse"]
    count = query(live_client, "SELECT count(*) FROM task WHERE visit_id = %s AND status <> 'completed'", visit)
    assert count == (1,)


def test_leaving_and_standalone_finding(live_client):
    visit = sign_in(live_client, complaint_group="general")
    base = {"reporter": "patient", "channel": "phone", "captured_at": now()}
    finding = post(live_client, {**base, "submission_id": sid(), "kind": "finding", "findings": ["speech_change"]})
    assert finding.status_code == 200, finding.text
    assert finding.json()["patient_message"] == "clinician_will_check"
    assert finding.json()["follow_up_items"] == ["last_known_well"]
    leaving = post(live_client, {**base, "submission_id": sid(), "kind": "leaving"})
    assert leaving.json()["patient_message"] == "leaving_info"
    assert open_task(live_client, visit)[0] == "red"  # leave risk ranks below red; nothing went down


# --- retries and who may report ----------------------------------------------


def test_retry_is_a_duplicate_and_reused_id_is_refused(live_client):
    visit = sign_in(live_client)
    body = checkin(change="worse")
    first = post(live_client, body)
    again = post(live_client, body)
    assert again.status_code == 200
    assert again.json() == {**first.json(), "duplicate": True}
    assert query(live_client, "SELECT count(*) FROM report WHERE visit_id = %s", visit) == (1,)
    assert query(live_client, "SELECT count(*) FROM task_reason r JOIN task t ON t.id = r.task_id WHERE t.visit_id = %s", visit) == (1,)
    changed = post(live_client, {**body, "feeling_change": {"kind": "answered", "value": "much_worse"}})
    assert changed.status_code == 409


def test_reporter_and_channel_must_match_the_session(live_client):
    sign_in(live_client, role="companion")
    assert post(live_client, checkin(reporter="patient")).status_code == 422
    wrong_channel = checkin(reporter="companion", pain=None)
    wrong_channel["channel"] = "pager"
    assert post(live_client, wrong_channel).status_code == 422
    ok = post(live_client, checkin(reporter="companion", findings=["new_confusion"]))
    assert ok.status_code == 200, ok.text


def test_signed_out_device_cant_report(live_client):
    sign_in(live_client)
    assert live_client.post("/api/session/sign-out", json={"submission_id": sid()}).status_code == 204
    assert post(live_client, checkin()).status_code == 401


def test_no_session_cant_report(live_client):
    assert post(live_client, checkin()).status_code == 401


def test_question_bank_is_checked(live_client):
    sign_in(live_client)
    assert post(live_client, checkin(questionnaire_version="1999-01-01.0")).status_code == 422
    assert post(live_client, checkin(items={"no_such_item": {"kind": "yes_no", "value": True}})).status_code == 422
    assert post(live_client, checkin(items={"pain_moved": {"kind": "choice", "value": "yes"}})).status_code == 422


# --- circle-counting check ---------------------------------------------------


def issue_prompt(client, visit_id, expected=3, minutes=5):
    async def run():
        async with client.app.state.pool.connection() as conn:
            await conn.execute("SELECT set_config('app.actor', 'test|prompt', true)")
            cur = await conn.execute(
                "INSERT INTO attention_prompt (visit_id, questionnaire_version, expires_at, steps, show_ms, gap_ms,"
                " expected_count) VALUES (%s, %s, now() + %s, '[{\"shape\":\"circle\",\"x\":0.5,\"y\":0.5}]', 600, 200, %s)"
                " RETURNING id::text",
                [visit_id, default_bank().version, timedelta(minutes=minutes), expected],
            )
            return (await cur.fetchone())[0]

    return client.portal.call(run)


def test_wrong_count_asks_for_an_in_person_check_and_prompt_is_single_use(live_client):
    visit = sign_in(live_client)
    prompt = issue_prompt(live_client, visit, expected=3)
    r = post(live_client, checkin(attention={"kind": "answered", "prompt_id": prompt, "count": 2}))
    assert r.status_code == 200, r.text
    assert r.json()["patient_message"] == "none"
    level, _, _, _, reasons = open_task(live_client, visit)
    assert (level, reasons) == ("overdue", ["attention_incorrect"])
    reuse = post(live_client, checkin(attention={"kind": "answered", "prompt_id": prompt, "count": 3}))
    assert reuse.status_code == 422


def test_right_count_raises_nothing_and_foreign_prompt_is_refused(live_client):
    other_visit = sign_in(live_client)
    foreign = issue_prompt(live_client, other_visit)
    visit = sign_in(live_client)
    prompt = issue_prompt(live_client, visit, expected=4)
    assert post(live_client, checkin(attention={"kind": "answered", "prompt_id": foreign, "count": 3})).status_code == 422
    ok = post(live_client, checkin(attention={"kind": "answered", "prompt_id": prompt, "count": 4}))
    assert ok.status_code == 200, ok.text
    assert open_task(live_client, visit) is None


# --- enrolment CEDIS check (added with step 3) -------------------------------


def test_enrolment_rejects_a_group_the_cedis_map_contradicts(live_client):
    live_client.post("/api/staff/session", json={"role": "triage_nurse"})
    body = {"submission_id": sid(), "ctas": 3, "complaint_group": "head_injury", "cedis_code": "003",
            "language": "en", "channel": "phone"}
    r = live_client.post("/api/visits", json=body)
    assert r.status_code == 422
    assert "chest_back_pain" in r.json()["detail"]
