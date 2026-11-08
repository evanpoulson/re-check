"""Check-in reminders against the real database, rolled back after each test.

The test transaction freezes now(), so each test moves the prompt due time
instead of waiting. Nothing is sent to a real push service.
"""

import pytest

from recheck import push
from recheck.settings import Vapid

from test_push import browser_keys
from test_reports_live import checkin, post, query, sign_in

pytestmark = pytest.mark.live

FCM = "https://fcm.googleapis.com/fcm/send/"


@pytest.fixture(autouse=True)
def vapid_key(monkeypatch):
    monkeypatch.setenv("RECHECK_VAPID_PRIVATE_KEY", push.keygen()[0])
    monkeypatch.setenv("RECHECK_VAPID_SUBJECT", "mailto:demo@example.com")


def subscribe(client, name="a", keys=None):
    return client.put("/api/patient/push/subscription", json={"endpoint": FCM + name, "keys": keys or browser_keys()})


def subscriptions(client, visit_id):
    return query(
        client,
        "SELECT p.endpoint, p.ended_reason::text FROM push_subscription p JOIN visit_session s ON s.id = p.session_id"
        " WHERE s.visit_id = %s ORDER BY p.created_at, p.ended_at NULLS LAST",
        visit_id,
        one=False,
    )


def due_in_past(client, visit_id, minutes):
    query_write(client, f"UPDATE visit SET next_prompt_due_at = now() - interval '{minutes} minutes' WHERE id = %s", visit_id)


def query_write(client, sql, *params):
    async def run():
        async with client.app.state.pool.connection() as conn:
            await conn.execute("SELECT set_config('app.actor', 'test|clock', true)")
            await conn.execute(sql, list(params))

    client.portal.call(run)


def claim(client):
    async def run():
        async with client.app.state.pool.connection() as conn:
            await conn.execute("SELECT set_config('app.actor', %s, true)", [push.ACTOR])
            return await push.claim(conn)

    return client.portal.call(run)


def slots(client, visit_id):
    rows = query(client, "SELECT slot FROM push_send WHERE visit_id = %s ORDER BY slot", visit_id, one=False)
    return [r[0] for r in rows]


# --- saving a subscription ------------------------------------------------------


def test_saving_the_same_subscription_twice_changes_nothing(live_client):
    visit = sign_in(live_client, due=False)
    keys = browser_keys()
    assert subscribe(live_client, keys=keys).status_code == 204
    assert subscribe(live_client, keys=keys).status_code == 204
    assert subscriptions(live_client, visit) == [(FCM + "a", None)]


def test_a_new_subscription_replaces_the_old_and_turning_off_ends_it(live_client):
    visit = sign_in(live_client, due=False)
    subscribe(live_client, "a")
    subscribe(live_client, "b")
    assert subscriptions(live_client, visit) == [(FCM + "a", "replaced"), (FCM + "b", None)]
    assert live_client.delete("/api/patient/push/subscription").status_code == 204
    assert live_client.delete("/api/patient/push/subscription").status_code == 204, "a retry is harmless"
    assert subscriptions(live_client, visit) == [(FCM + "a", "replaced"), (FCM + "b", "turned_off")]


def test_endpoints_and_keys_stay_out_of_the_audit_log(live_client):
    sign_in(live_client, due=False)
    subscribe(live_client)
    leaked = query(
        live_client,
        "SELECT count(*) FROM audit_log WHERE event LIKE 'push_subscription.%%' AND payload ?| ARRAY['endpoint','p256dh','auth']",
    )
    assert leaked == (0,)


# --- claiming reminders -----------------------------------------------------------


def test_reminders_go_at_the_due_time_and_every_five_minutes_once_each(live_client):
    visit = sign_in(live_client, due=False)  # CTAS 3: 30-minute interval
    subscribe(live_client)
    assert claim(live_client) == [], "not due yet"

    due_in_past(live_client, visit, 1)
    first = claim(live_client)
    assert [r.endpoint for r in first] == [FCM + "a"]
    assert claim(live_client) == [], "slot 0 is sent once"

    # Due 11 minutes ago: only the current slot (2), not the ones in between.
    query_write(live_client, "UPDATE visit SET next_prompt_due_at = next_prompt_due_at - interval '10 minutes' WHERE id = %s", visit)
    due = query(live_client, "SELECT next_prompt_due_at FROM visit WHERE id = %s", visit)[0]
    assert len(claim(live_client)) == 1
    assert query(live_client, "SELECT slot FROM push_send WHERE visit_id = %s AND due_at = %s", visit, due) == (2,)


def test_reminders_stop_one_interval_after_the_due_time(live_client):
    visit = sign_in(live_client, due=False)
    subscribe(live_client)
    due_in_past(live_client, visit, 30)
    assert claim(live_client) == []
    due_in_past(live_client, visit, 29)
    assert len(claim(live_client)) == 1


def test_checking_in_moves_the_due_time_so_reminders_stop(live_client):
    visit = sign_in(live_client, due=False)
    subscribe(live_client)
    due_in_past(live_client, visit, 6)
    assert len(claim(live_client)) == 1
    assert post(live_client, checkin()).status_code == 200
    assert claim(live_client) == []


def test_no_reminders_after_sign_out_or_turning_them_off(live_client):
    visit = sign_in(live_client, due=False)
    subscribe(live_client)
    live_client.delete("/api/patient/push/subscription")
    due_in_past(live_client, visit, 1)
    assert claim(live_client) == []

    other = sign_in(live_client, due=False)
    subscribe(live_client)
    live_client.post("/api/session/sign-out", json={"submission_id": "00000000-0000-4000-8000-000000000001"})
    due_in_past(live_client, other, 1)
    assert claim(live_client) == []
    assert slots(live_client, visit) == [] and slots(live_client, other) == []


# --- a whole round ----------------------------------------------------------------


def test_a_round_records_outcomes_and_ends_subscriptions_the_service_dropped(live_client, monkeypatch):
    visit = sign_in(live_client, due=False)
    subscribe(live_client)
    due_in_past(live_client, visit, 1)
    sent = []

    def fake_deliver(reminder, settings, signer):
        sent.append(reminder.endpoint)
        return push.Result("gone", 410)

    monkeypatch.setattr(push, "deliver", fake_deliver)
    sender = push.Sender(Vapid(private_key=push.keygen()[0], subject="mailto:demo@example.com"))
    assert live_client.portal.call(sender.run_round, live_client.app.state.pool) == 1
    assert sent == [FCM + "a"]
    assert query(live_client, "SELECT outcome::text, status_code FROM push_send WHERE visit_id = %s", visit) == ("gone", 410)
    assert subscriptions(live_client, visit) == [(FCM + "a", "gone")]
    assert live_client.portal.call(sender.run_round, live_client.app.state.pool) == 0
