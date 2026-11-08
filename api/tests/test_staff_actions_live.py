"""Staff actions against the real database, rolled back after each test."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from test_reports_live import checkin, post, query, sid, sign_in

pytestmark = pytest.mark.live


def as_staff(client, role):
    assert client.post("/api/staff/session", json={"role": role}).status_code == 200


def red_task(client):
    """A signed-in visit with an open red task. Returns (visit_id, task_id)."""
    visit = sign_in(client)
    assert post(client, checkin(change="much_worse")).status_code == 200
    task_id = query(client, "SELECT id::text FROM task WHERE visit_id = %s AND status = 'open'", visit)[0]
    return visit, task_id


# --- acknowledge and assess --------------------------------------------------


def test_full_loop_acknowledge_then_assess(live_client):
    visit, task = red_task(live_client)
    as_staff(live_client, "physician")

    early = live_client.post(f"/api/tasks/{task}/assess", json={"submission_id": sid(), "disposition": "assessed_stable"})
    assert early.status_code == 409, "assessment needs an acknowledgement first"

    ack_body = {"submission_id": sid()}
    ack = live_client.post(f"/api/tasks/{task}/acknowledge", json=ack_body)
    assert ack.status_code == 200, ack.text
    t = ack.json()
    assert t["status"] == "acknowledged" and t["acknowledged_by"] == {"user_id": "demo|physician", "role": "physician"}
    assert live_client.post(f"/api/tasks/{task}/acknowledge", json=ack_body).json() == t, "retry returns the same task"
    assert live_client.post(f"/api/tasks/{task}/acknowledge", json={"submission_id": sid()}).status_code == 409

    done = live_client.post(f"/api/tasks/{task}/assess", json={"submission_id": sid(), "disposition": "assessed_stable"})
    assert done.status_code == 200, done.text
    d = done.json()
    assert d["status"] == "completed" and d["disposition"] == "assessed_stable"
    assert d["acknowledged_at"] == t["acknowledged_at"], "acknowledgement is never rewritten"

    status, last_check, due = query(
        live_client, "SELECT status::text, last_staff_check_at, staff_reassess_due_at FROM visit WHERE id = %s", visit
    )
    assert status == "waiting" and last_check is not None
    assert due == last_check + timedelta(minutes=30), "staff timer restarts a full CTAS 3 interval from the check"

    # The worklist no longer shows an open task; the timeline shows each step.
    rows = live_client.get("/api/worklist").json()["rows"]
    assert next(r for r in rows if r["visit"]["visit_id"] == visit)["open_task"] is None
    events = [e["event"] for e in live_client.get(f"/api/visits/{visit}").json()["timeline"] if e["type"] == "task_event"]
    assert events[-2:] == ["acknowledged", "assessed"]


def test_roomed_assessment_closes_the_visit_and_signs_the_phone_out(live_client):
    visit, task = red_task(live_client)
    as_staff(live_client, "charge_nurse")
    live_client.post(f"/api/tasks/{task}/acknowledge", json={"submission_id": sid()})
    r = live_client.post(f"/api/tasks/{task}/assess", json={"submission_id": sid(), "disposition": "roomed"})
    assert r.status_code == 200, r.text
    assert query(live_client, "SELECT status::text, closed_at IS NOT NULL FROM visit WHERE id = %s", visit) == ("roomed", True)
    assert query(live_client, "SELECT count(*) FROM visit_session WHERE visit_id = %s AND revoked_at IS NULL", visit) == (0,)
    assert live_client.post(f"/api/tasks/{task}/assess", json={"submission_id": sid(), "disposition": "roomed"}).status_code == 409


def test_task_actions_need_clinical_staff_and_a_real_task(live_client):
    _, task = red_task(live_client)
    as_staff(live_client, "quality")
    assert live_client.post(f"/api/tasks/{task}/acknowledge", json={"submission_id": sid()}).status_code == 403
    as_staff(live_client, "physician")
    assert live_client.post(f"/api/tasks/{uuid4()}/acknowledge", json={"submission_id": sid()}).status_code == 404


# --- vitals ------------------------------------------------------------------


def test_vitals_and_a_correction(live_client):
    visit = sign_in(live_client)
    as_staff(live_client, "triage_nurse")
    body = {"submission_id": sid(), "visit_id": visit, "measured_at": datetime.now(UTC).isoformat(),
            "sbp": 182, "dbp": 104, "hr": 96, "spo2": 97}
    r = live_client.post(f"/api/visits/{visit}/vitals", json=body)
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["vitals_id"] == body["submission_id"] and rec["sbp"] == 182 and rec["temp_c"] is None
    assert rec["entered_by"] == {"user_id": "demo|triage_nurse", "role": "triage_nurse"}
    again = live_client.post(f"/api/visits/{visit}/vitals", json=body)
    assert again.status_code == 200 and again.json() == rec

    fix = {**body, "submission_id": sid(), "sbp": 128, "dbp": 84, "supersedes": rec["vitals_id"]}
    assert live_client.post(f"/api/visits/{visit}/vitals", json=fix).status_code == 201
    assert query(live_client, "SELECT count(*) FROM vitals WHERE visit_id = %s", visit) == (2,), "original is kept"
    assert query(live_client, "SELECT last_staff_check_at IS NOT NULL FROM visit WHERE id = %s", visit) == (True,)

    bad = {**body, "submission_id": sid(), "supersedes": str(uuid4())}
    assert live_client.post(f"/api/visits/{visit}/vitals", json=bad).status_code == 422
    other = {**body, "submission_id": sid(), "visit_id": str(uuid4())}
    assert live_client.post(f"/api/visits/{visit}/vitals", json=other).status_code == 422
    as_staff(live_client, "physician")
    assert live_client.post(f"/api/visits/{visit}/vitals", json={**body, "submission_id": sid()}).status_code == 403


# --- flag higher -------------------------------------------------------------


def test_flag_higher_opens_amber_and_never_lowers_red(live_client):
    visit = sign_in(live_client)
    as_staff(live_client, "triage_nurse")
    body = {"submission_id": sid(), "visit_id": visit, "note": "Looks grey and sweaty"}
    r = live_client.post(f"/api/visits/{visit}/flag", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["note"] == "Looks grey and sweaty" and r.json()["flagged_by"]["role"] == "triage_nurse"
    level, reason, evidence = query(
        live_client,
        "SELECT t.level::text, r.reason_code, r.evidence FROM task t JOIN task_reason r ON r.task_id = t.id"
        " WHERE t.visit_id = %s",
        visit,
    )
    assert (level, reason) == ("amber", "staff_flag")
    assert evidence == [{"kind": "flag", "id": body["submission_id"]}]
    assert live_client.post(f"/api/visits/{visit}/flag", json=body).status_code == 200

    visit2, _ = red_task(live_client)
    as_staff(live_client, "triage_nurse")
    live_client.post(f"/api/visits/{visit2}/flag", json={"submission_id": sid(), "visit_id": visit2})
    assert query(live_client, "SELECT level::text FROM task WHERE visit_id = %s AND status = 'open'", visit2) == ("red",)

    timeline = live_client.get(f"/api/visits/{visit}").json()["timeline"]
    assert any(e["type"] == "flag" for e in timeline)


# --- visit status and exclusion ----------------------------------------------


def test_closing_a_visit_stops_its_qr(live_client):
    visit = sign_in(live_client)
    as_staff(live_client, "triage_nurse")
    body = {"submission_id": sid(), "status": "left"}
    assert live_client.post(f"/api/visits/{visit}/status", json=body).status_code == 204
    assert live_client.post(f"/api/visits/{visit}/status", json=body).status_code == 204, "retry is harmless"
    assert live_client.post(f"/api/visits/{visit}/status", json={"submission_id": sid(), "status": "roomed"}).status_code == 409
    assert query(live_client, "SELECT status::text FROM visit WHERE id = %s", visit) == ("left",)
    assert post(live_client, checkin()).status_code == 401, "the signed-in phone is signed out"


def test_excluding_stops_prompts_but_keeps_staff_timer(live_client):
    visit = sign_in(live_client)
    as_staff(live_client, "triage_nurse")
    r = live_client.post(f"/api/visits/{visit}/exclusion", json={"submission_id": sid(), "app_exclusion": "major_trauma"})
    assert r.status_code == 204, r.text
    prompt_due, staff_due = query(live_client, "SELECT next_prompt_due_at, staff_reassess_due_at FROM visit WHERE id = %s", visit)
    assert prompt_due is None and staff_due is not None
    again = live_client.post(f"/api/visits/{visit}/exclusion", json={"submission_id": sid(), "app_exclusion": "child"})
    assert again.status_code == 409
    assert post(live_client, checkin()).status_code == 401
