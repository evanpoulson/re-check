"""Site settings and the patient's triage level, against the real database, rolled back after each test."""

import pytest

from test_reports_live import query, sign_in

pytestmark = pytest.mark.live


def as_role(client, role):
    assert client.post("/api/staff/session", json={"role": role}).status_code == 200


def set_level(client, on: bool):
    r = client.put("/api/site-settings", json={"show_triage_level": on})
    assert r.status_code == 200, r.text
    return r.json()


def test_level_is_hidden_until_the_nurse_turns_it_on(live_client):
    sign_in(live_client, ctas=4)
    as_role(live_client, "triage_nurse")
    set_level(live_client, False)
    assert live_client.get("/api/patient/home").json()["triage_level"] is None

    saved = set_level(live_client, True)
    assert saved["show_triage_level"] is True and saved["updated_at"]
    assert live_client.get("/api/site-settings").json()["show_triage_level"] is True
    assert live_client.get("/api/patient/home").json()["triage_level"] == 4

    set_level(live_client, False)
    assert live_client.get("/api/patient/home").json()["triage_level"] is None


def test_companion_sees_the_same_level(live_client):
    sign_in(live_client, role="companion", ctas=2)
    as_role(live_client, "charge_nurse")
    set_level(live_client, True)
    assert live_client.get("/api/patient/home").json()["triage_level"] == 2


def test_each_change_is_audited_with_the_actor(live_client):
    as_role(live_client, "triage_nurse")
    set_level(live_client, True)
    set_level(live_client, True)  # a retry is harmless
    actor, on = query(
        live_client,
        "SELECT actor, (payload ->> 'show_triage_level')::boolean FROM audit_log"
        " WHERE event LIKE 'site_setting.%%' ORDER BY at DESC LIMIT 1",
    )
    assert actor == "demo|triage_nurse" and on is True
