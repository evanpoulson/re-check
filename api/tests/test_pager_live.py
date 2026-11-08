"""Hardware pager routes against the real database, rolled back after each test."""

import random
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from recheck.question_bank import default_bank

pytestmark = pytest.mark.live

KEY = "pager-key-for-tests-0123456789"
HEADERS = {"X-Pager-Key": KEY}
NOT_ASKED = {"kind": "missing", "reason": "not_asked"}


@pytest.fixture(autouse=True)
def pager_key(monkeypatch):
    monkeypatch.setenv("RECHECK_PAGER_KEY", KEY)


def sid() -> str:
    return str(uuid4())


def now() -> str:
    return datetime.now(UTC).isoformat()


def free_pager() -> str:
    # Synthetic batches use pager numbers below 901000, so these never collide with seeded visits.
    return str(random.randint(950000, 999999))


def query(client, sql, *params):
    async def run():
        async with client.app.state.pool.connection() as conn:
            cur = await conn.execute(sql, list(params))
            return await cur.fetchone()

    return client.portal.call(run)


def write(client, sql, *params):
    async def run():
        async with client.app.state.pool.connection() as conn:
            await conn.execute("SELECT set_config('app.actor', 'test|clock', true)")
            await conn.execute(sql, list(params))

    client.portal.call(run)


def enrol_pager_visit(client, pager_no: str, *, due: bool = True) -> str:
    client.post("/api/staff/session", json={"role": "triage_nurse"})
    body = {
        "submission_id": sid(), "ctas": 3, "complaint_group": "chest_back_pain", "language": "en",
        "channel": "pager", "pager_no": pager_no,
    }
    enrolled = client.post("/api/visits", json=body)
    assert enrolled.status_code == 201, enrolled.text
    visit_id = enrolled.json()["visit_id"]
    if due:
        write(client, "UPDATE visit SET next_prompt_due_at = now() - interval '1 minute' WHERE id = %s", visit_id)
    return visit_id


def wellness(feeling_now: str, feeling_change: str, **extra) -> dict:
    """A pager check-in: the two wellness questions only."""
    body = {
        "submission_id": sid(), "kind": "checkin", "reporter": "patient", "channel": "pager",
        "captured_at": now(), "questionnaire_version": default_bank().version,
        "feeling_now": {"kind": "answered", "value": feeling_now},
        "feeling_change": {"kind": "answered", "value": feeling_change},
        "pain": NOT_ASKED, "new_findings": NOT_ASKED, "attention": NOT_ASKED, "items": {},
    }
    body.update(extra)
    return body


def test_state_needs_the_pager_key(live_client):
    assert live_client.get(f"/api/pager/{free_pager()}").status_code == 401
    assert live_client.get(f"/api/pager/{free_pager()}", headers={"X-Pager-Key": "nope-nope-nope-nope"}).status_code == 401


def test_an_unused_pager_is_unassigned(live_client):
    r = live_client.get(f"/api/pager/{free_pager()}", headers=HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "unassigned"
    assert r.json()["checkin_open"] is False


def test_a_waiting_pager_shows_its_open_checkin(live_client):
    pager = free_pager()
    enrol_pager_visit(live_client, pager)
    body = live_client.get(f"/api/pager/{pager}", headers=HEADERS).json()
    assert body["state"] == "waiting"
    assert body["checkin_open"] is True
    assert body["questionnaire_version"] == default_bank().version


def test_a_worsening_pager_checkin_is_stored_without_a_session_and_routed(live_client):
    pager = free_pager()
    visit_id = enrol_pager_visit(live_client, pager)
    report = wellness("very_poor", "much_worse")
    r = live_client.post(f"/api/pager/{pager}/reports", json=report, headers=HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["duplicate"] is False
    assert r.json()["patient_message"] != "none"
    channel, session_id, visit = query(
        live_client, "SELECT channel::text, session_id, visit_id::text FROM report WHERE id = %s", report["submission_id"]
    )
    assert (channel, session_id, visit) == ("pager", None, visit_id)
    # The check-in restarted the patient prompt timer.
    assert live_client.get(f"/api/pager/{pager}", headers=HEADERS).json()["checkin_open"] is False


def test_a_retry_returns_the_same_receipt(live_client):
    pager = free_pager()
    enrol_pager_visit(live_client, pager)
    report = wellness("ok", "same")
    first = live_client.post(f"/api/pager/{pager}/reports", json=report, headers=HEADERS)
    again = live_client.post(f"/api/pager/{pager}/reports", json=report, headers=HEADERS)
    assert first.status_code == again.status_code == 200
    assert again.json()["duplicate"] is True


def test_help_now_is_accepted_any_time(live_client):
    pager = free_pager()
    enrol_pager_visit(live_client, pager, due=False)
    body = {"submission_id": sid(), "kind": "concern", "concern": "help_now", "reporter": "patient",
            "channel": "pager", "captured_at": now()}
    r = live_client.post(f"/api/pager/{pager}/reports", json=body, headers=HEADERS)
    assert r.status_code == 200, r.text


def test_a_checkin_before_it_is_due_is_refused(live_client):
    pager = free_pager()
    enrol_pager_visit(live_client, pager, due=False)
    write(live_client, "UPDATE visit SET next_prompt_due_at = now() + interval '30 minutes' WHERE pager_no = %s", pager)
    r = live_client.post(f"/api/pager/{pager}/reports", json=wellness("ok", "same"), headers=HEADERS)
    assert r.status_code == 409


def test_wrong_channel_or_reporter_is_refused(live_client):
    pager = free_pager()
    enrol_pager_visit(live_client, pager)
    phone = wellness("ok", "same", channel="phone")
    assert live_client.post(f"/api/pager/{pager}/reports", json=phone, headers=HEADERS).status_code == 422
    companion = wellness("ok", "same", reporter="companion")
    assert live_client.post(f"/api/pager/{pager}/reports", json=companion, headers=HEADERS).status_code == 422


def test_a_report_for_an_unassigned_pager_is_not_found(live_client):
    r = live_client.post(f"/api/pager/{free_pager()}/reports", json=wellness("ok", "same"), headers=HEADERS)
    assert r.status_code == 404


def test_a_roomed_patient_is_called_to_the_desk(live_client):
    pager = free_pager()
    visit_id = enrol_pager_visit(live_client, pager)
    write(live_client, "UPDATE visit SET status = 'roomed', closed_at = now() WHERE id = %s", visit_id)
    assert live_client.get(f"/api/pager/{pager}", headers=HEADERS).json()["state"] == "called"
