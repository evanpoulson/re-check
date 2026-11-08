"""Charge nurse escalations and shift handover against the real database, rolled back after each test."""

from datetime import UTC, datetime

import pytest

from test_reports_live import checkin, post, query, sid, sign_in
from test_scheduler_live import run as run_timers

pytestmark = pytest.mark.live


def as_staff(client, role):
    assert client.post("/api/staff/session", json={"role": role}).status_code == 200


def task_of(client, visit):
    return query(client, "SELECT id::text FROM task WHERE visit_id = %s AND status <> 'completed'", visit)[0]


def escalation_ids(client):
    r = client.get("/api/escalations")
    assert r.status_code == 200, r.text
    return r.json(), {t["task_id"] for t in r.json()["tasks"]}


def test_only_the_charge_nurse_sees_escalations(live_client):
    for role in ("triage_nurse", "physician", "quality"):
        as_staff(live_client, role)
        assert live_client.get("/api/escalations").status_code == 403
    as_staff(live_client, "charge_nurse")
    assert live_client.get("/api/escalations").status_code == 200


def test_escalated_red_and_nurse_flag_reach_the_charge_nurse_but_a_fresh_red_doesnt(live_client, monkeypatch):
    monkeypatch.delenv("RECHECK_TLP_HOURS", raising=False)
    escalated = sign_in(live_client)
    post(live_client, checkin(change="much_worse"))
    run_timers(live_client, "UPDATE task SET ack_due_at = now() - interval '1 minute' WHERE id = %s",
               task_of(live_client, escalated))
    later = sign_in(live_client)  # its red is still inside the 2-minute acknowledgement window
    post(live_client, checkin(change="much_worse"))
    flagged = sign_in(live_client)
    as_staff(live_client, "triage_nurse")
    live_client.post(f"/api/visits/{flagged}/flag", json={"submission_id": sid(), "visit_id": flagged})

    as_staff(live_client, "charge_nurse")
    view, ids = escalation_ids(live_client)
    assert view["tlp_on_duty"] is True
    assert task_of(live_client, escalated) in ids
    assert task_of(live_client, flagged) in ids
    assert task_of(live_client, later) not in ids, "a red the physician still has time to acknowledge"
    for t in view["tasks"]:
        assert t["escalated"] or "charge_nurse" in t["routed_to"] or any(
            r["reason_code"] == "staff_flag" for r in t["reasons"]
        )


def test_everything_goes_to_the_charge_nurse_when_no_physician_is_on_duty(live_client, monkeypatch):
    sign_in(live_client)
    post(live_client, checkin(change="worse"))
    # Physician hours that start two hours from now, so nobody is on duty at the moment.
    hour = datetime.now(UTC).hour
    monkeypatch.setenv("RECHECK_SITE_TIMEZONE", "UTC")
    monkeypatch.setenv("RECHECK_TLP_HOURS", f"{(hour + 2) % 24:02d}:00-{(hour + 3) % 24:02d}:00")

    as_staff(live_client, "charge_nurse")
    view, ids = escalation_ids(live_client)
    assert view["tlp_on_duty"] is False
    open_tasks = query(
        live_client,
        "SELECT count(*) FROM task t JOIN visit v ON v.id = t.visit_id"
        " WHERE v.site_id = 'foothills-demo' AND v.status = 'waiting' AND t.status <> 'completed'",
    )[0]
    assert len(ids) == open_tasks
    levels = [t["level"] for t in view["tasks"]]
    order = ["overdue", "leave_risk", "silent", "amber", "red"]
    assert [order.index(x) for x in levels] == sorted((order.index(x) for x in levels), reverse=True)


def test_handover_lists_every_waiting_patient_open_tasks_and_overdue_reassessments(live_client):
    sign_in(live_client)
    post(live_client, checkin(change="much_worse"))
    as_staff(live_client, "triage_nurse")
    r = live_client.get("/api/handover")
    assert r.status_code == 200, r.text
    h = r.json()
    waiting = query(live_client, "SELECT count(*) FROM visit WHERE site_id = 'foothills-demo' AND status = 'waiting'")[0]
    assert len(h["patients"]) == waiting
    assert [p["rank"] for p in h["patients"]] == list(range(1, waiting + 1))
    assert h["shift_start"] <= h["generated_at"] < h["shift_end"]
    overdue = {p["visit"]["visit_id"] for p in h["patients"] if p["reassess_overdue"]}
    assert set(h["reassess_overdue"]) == overdue
    assert {t["task_id"] for t in h["open_tasks"]} == {p["open_task"]["task_id"] for p in h["patients"] if p["open_task"]}
    as_staff(live_client, "quality")
    assert live_client.get("/api/handover").status_code == 403
