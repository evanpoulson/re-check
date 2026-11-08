"""Staff screens against the real database (seeded demo data plus rolled-back test visits)."""

from uuid import uuid4

import pytest

from recheck.rules import LEVEL_ORDER

from test_reports_live import checkin, post, query, sign_in

pytestmark = pytest.mark.live


def as_staff(client, role):
    assert client.post("/api/staff/session", json={"role": role}).status_code == 200


def level_rank(row):
    task = row["open_task"]
    return LEVEL_ORDER.index(task["level"]) if task else -1


def test_who_can_see_which_screen(live_client):
    as_staff(live_client, "triage_nurse")
    assert live_client.get("/api/triage-board").status_code == 200
    assert live_client.get("/api/worklist").status_code == 403
    as_staff(live_client, "physician")
    assert live_client.get("/api/worklist").status_code == 200
    assert live_client.get("/api/triage-board").status_code == 403
    as_staff(live_client, "quality")
    assert live_client.get(f"/api/visits/{uuid4()}").status_code == 403
    live_client.cookies.clear()
    assert live_client.get("/api/worklist").status_code == 401


def test_worklist_ranks_by_task_level_then_wait(live_client):
    as_staff(live_client, "physician")
    rows = live_client.get("/api/worklist").json()["rows"]
    waiting = query(live_client, "SELECT count(*) FROM visit WHERE site_id = 'foothills-demo' AND status = 'waiting'")[0]
    assert len(rows) == waiting
    assert [r["rank"] for r in rows] == list(range(1, len(rows) + 1))
    for a, b in zip(rows, rows[1:]):
        assert level_rank(a) >= level_rank(b)
        if level_rank(a) == level_rank(b):
            assert a["visit"]["triaged_at"] <= b["visit"]["triaged_at"]
    for r in rows:
        assert r["visit"]["status"] == "waiting"
        if r["silent"]:
            assert r["prompt_overdue"]


def test_every_seeded_visit_timeline_builds(live_client):
    """Rebuilding stored reports into the contract must work for all the demo data."""
    as_staff(live_client, "charge_nurse")
    ids = query(live_client, "SELECT array_agg(id::text) FROM visit WHERE site_id = 'foothills-demo'")[0]
    assert ids
    for visit_id in ids:
        r = live_client.get(f"/api/visits/{visit_id}")
        assert r.status_code == 200, (visit_id, r.text[:500])
        stamps = [e.get("received_at") or e.get("started_at") or e.get("at") for e in r.json()["timeline"]]
        assert stamps == sorted(stamps)


def test_new_red_report_tops_the_worklist_and_shows_on_the_timeline(live_client):
    visit = sign_in(live_client)
    body = checkin(change="much_worse", pain=8)
    assert post(live_client, body).status_code == 200

    as_staff(live_client, "physician")
    rows = live_client.get("/api/worklist").json()["rows"]
    mine = next(r for r in rows if r["visit"]["visit_id"] == visit)
    assert mine["open_task"]["level"] == "red"
    assert all(level_rank(r) <= LEVEL_ORDER.index("red") for r in rows)
    assert mine["rank"] <= sum(1 for r in rows if level_rank(r) == LEVEL_ORDER.index("red"))
    assert mine["last_report"]["kind"] == "checkin"
    assert mine["trend"][-1]["pain"] == 8 and mine["trend"][-1]["feeling_change"] == "much_worse"
    assert mine["visit"]["signed_in_as"] == "patient"

    detail = live_client.get(f"/api/visits/{visit}").json()
    types = [e["type"] for e in detail["timeline"]]
    assert {"session", "report", "task_event"} <= set(types)
    report = next(e for e in detail["timeline"] if e["type"] == "report")
    assert report["report_id"] == body["submission_id"]
    assert report["report"]["feeling_change"] == {"kind": "answered", "value": "much_worse"}
    assert report["report"]["pain"] == {"kind": "answered", "value": 8}
    created = next(e for e in detail["timeline"] if e["type"] == "task_event")
    assert created["event"] == "created" and created["level"] == "red"
    assert detail["open_task"]["reasons"][0]["reason_code"] == "feeling_worse"


def test_triage_board_shows_task_colour_not_reasons(live_client):
    visit = sign_in(live_client)
    post(live_client, checkin(change="worse"))
    as_staff(live_client, "triage_nurse")
    rows = live_client.get("/api/triage-board").json()["rows"]
    mine = next(r for r in rows if r["visit_id"] == visit)
    assert mine["level"] == "amber"
    assert set(mine) == {"visit_id", "ctas", "complaint_group", "triaged_at", "level", "staff_reassess_due_at",
                         "reassess_overdue"}


def test_unknown_visit_is_404(live_client):
    as_staff(live_client, "physician")
    assert live_client.get(f"/api/visits/{uuid4()}").status_code == 404
