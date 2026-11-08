"""Timer checks against the real database, rolled back after each test.

The test transaction freezes now(), so instead of waiting, each test moves the
relevant deadline into the past first.
"""

import pytest

from recheck import scheduler

from test_reports_live import checkin, post, query, sid, sign_in

pytestmark = pytest.mark.live


def run(client, sql=None, *params):
    """Optionally run setup SQL as a test actor, then one round of timer checks."""

    async def go():
        async with client.app.state.pool.connection() as conn:
            if sql:
                await conn.execute("SELECT set_config('app.actor', 'test|clock', true)")
                await conn.execute(sql, list(params))
            await conn.execute("SELECT set_config('app.actor', %s, true)", [scheduler.ACTOR])
            return await scheduler.run_checks(conn)

    return client.portal.call(go)


def reasons(client, visit_id):
    return query(
        client,
        "SELECT t.level::text, array_agg(r.reason_code ORDER BY r.fired_at, r.reason_code) FROM task t"
        " JOIN task_reason r ON r.task_id = t.id WHERE t.visit_id = %s AND t.status <> 'completed' GROUP BY t.id",
        visit_id,
    )


def test_missed_checkin_raises_silent_once_per_due_time(live_client):
    visit = sign_in(live_client)
    post(live_client, checkin())
    assert reasons(live_client, visit) is None

    first = run(live_client, "UPDATE visit SET next_prompt_due_at = now() - interval '6 minutes' WHERE id = %s", visit)
    assert first.ran and first.missed >= 1
    assert reasons(live_client, visit) == ("silent", ["missed_checkin"])
    assert run(live_client).ran
    assert reasons(live_client, visit) == ("silent", ["missed_checkin"]), "no repeat for the same due time"

    actor = query(live_client, "SELECT acknowledged_by FROM task WHERE visit_id = %s", visit)
    assert actor == (None,)
    evidence = query(
        live_client,
        "SELECT r.evidence FROM task_reason r JOIN task t ON t.id = r.task_id WHERE t.visit_id = %s",
        visit,
    )[0]
    assert evidence[0]["kind"] == "report"


def test_not_yet_silent_and_excluded_visits_are_left_alone(live_client):
    visit = sign_in(live_client)
    run(live_client, "UPDATE visit SET next_prompt_due_at = now() - interval '4 minutes' WHERE id = %s", visit)
    assert reasons(live_client, visit) is None, "under 5 minutes overdue is not silent yet"

    excluded = sign_in(live_client)
    live_client.post("/api/staff/session", json={"role": "triage_nurse"})
    live_client.post(f"/api/visits/{excluded}/exclusion", json={"submission_id": sid(), "app_exclusion": "child"})
    run(live_client)
    assert reasons(live_client, excluded) is None, "no prompts, so no missed check-ins"


def test_missed_checkin_never_lowers_a_red_task(live_client):
    visit = sign_in(live_client)
    post(live_client, checkin(change="much_worse"))
    run(live_client, "UPDATE visit SET next_prompt_due_at = now() - interval '10 minutes' WHERE id = %s", visit)
    level, codes = reasons(live_client, visit)
    assert level == "red" and codes == ["feeling_worse", "missed_checkin"]


def test_unacknowledged_red_escalates_to_charge_nurse_once(live_client):
    visit = sign_in(live_client)
    post(live_client, checkin(change="much_worse"))
    task = query(live_client, "SELECT id::text FROM task WHERE visit_id = %s", visit)[0]
    assert query(live_client, "SELECT escalated FROM task WHERE id = %s", task) == (False,)

    result = run(live_client, "UPDATE task SET ack_due_at = now() - interval '1 minute' WHERE id = %s", task)
    assert result.escalated >= 1
    escalated, routed = query(live_client, "SELECT escalated, routed_to::text[] FROM task WHERE id = %s", task)
    assert escalated and routed == ["physician", "charge_nurse"]
    run(live_client)
    assert query(live_client, "SELECT routed_to::text[] FROM task WHERE id = %s", task) == (["physician", "charge_nurse"],)

    live_client.post("/api/staff/session", json={"role": "charge_nurse"})
    events = [e["event"] for e in live_client.get(f"/api/visits/{visit}").json()["timeline"] if e["type"] == "task_event"]
    assert "escalated" in events


def test_acknowledged_or_amber_tasks_dont_escalate(live_client):
    acked = sign_in(live_client)
    post(live_client, checkin(change="much_worse"))
    task = query(live_client, "SELECT id::text FROM task WHERE visit_id = %s", acked)[0]
    live_client.post("/api/staff/session", json={"role": "physician"})
    assert live_client.post(f"/api/tasks/{task}/acknowledge", json={"submission_id": sid()}).status_code == 200

    amber = sign_in(live_client)
    post(live_client, checkin(change="worse"))
    amber_task = query(live_client, "SELECT id::text FROM task WHERE visit_id = %s", amber)[0]

    run(live_client, "UPDATE task SET ack_due_at = now() - interval '1 minute' WHERE id IN (%s, %s)", task, amber_task)
    assert query(live_client, "SELECT bool_or(escalated) FROM task WHERE id IN (%s, %s)", task, amber_task) == (False,)
