"""GET /api/patient/home against the real database, rolled back after each test."""

import pytest

from recheck.question_bank import default_bank

from test_reports_live import checkin, now, post, query, sid, sign_in

pytestmark = pytest.mark.live


def home(client):
    r = client.get("/api/patient/home")
    assert r.status_code == 200, r.text
    return r.json()


def test_needs_a_signed_in_device(live_client):
    assert live_client.get("/api/patient/home").status_code == 401


def test_patient_home_shows_follow_ups_prompt_and_times(live_client):
    sign_in(live_client, language="tl")
    h = home(live_client)
    assert h["role"] == "patient" and h["language"] == "tl"
    assert h["questionnaire_version"] == default_bank().version
    assert [i["key"] for i in h["items"]] == ["pain_moved", "pain_sudden_worse"]
    assert all(i["input_type"] == "yes_no" for i in h["items"])
    assert h["message"] == "none"
    assert h["waited_minutes"] >= 0
    assert h["next_checkin_due_at"] is not None
    # No fresh AHS estimate in the test database -> "Estimate unavailable", never a made-up number.
    assert h["wait_estimate"] is None or h["wait_estimate"]["source"] == "ahs_feed"
    prompt = h["attention_prompt"]
    assert prompt and prompt["steps"] and prompt["show_ms"] >= 200
    assert all(s["shape"] in ("circle", "square") for s in prompt["steps"])


def test_prompt_is_reused_until_answered_then_replaced(live_client):
    sign_in(live_client)
    first = home(live_client)["attention_prompt"]
    assert home(live_client)["attention_prompt"]["prompt_id"] == first["prompt_id"]
    # The expected count is server-side only.
    assert "expected_count" not in first
    expected = query(live_client, "SELECT expected_count FROM attention_prompt WHERE id = %s", first["prompt_id"])[0]
    r = post(live_client, checkin(attention={"kind": "answered", "prompt_id": first["prompt_id"], "count": expected}))
    assert r.status_code == 200, r.text
    assert home(live_client)["attention_prompt"]["prompt_id"] != first["prompt_id"]


def test_companion_gets_companion_wording_and_no_prompt(live_client):
    visit = sign_in(live_client, role="companion")
    h = home(live_client)
    assert h["role"] == "companion" and h["attention_prompt"] is None
    bank = default_bank()
    from recheck.question_bank import ext_value

    for item in h["items"]:
        companion_text = ext_value(bank.items[item["key"]], "companion-text")
        if companion_text:
            assert item["text"] == companion_text
    assert query(live_client, "SELECT count(*) FROM attention_prompt WHERE visit_id = %s", visit) == (0,)


def test_reported_finding_enables_its_follow_up(live_client):
    sign_in(live_client, complaint_group="general")
    assert "last_known_well" not in [i["key"] for i in home(live_client)["items"]]
    finding = {"submission_id": sid(), "kind": "finding", "findings": ["speech_change"],
               "reporter": "patient", "channel": "phone", "captured_at": now()}
    assert post(live_client, finding).status_code == 200
    assert "last_known_well" in [i["key"] for i in home(live_client)["items"]]


def test_staff_fields_never_leak(live_client):
    sign_in(live_client)
    post(live_client, checkin(change="much_worse"))
    text = live_client.get("/api/patient/home").text
    for staff_only in ("red", "level", "reason", "routed_to", "feeling_worse", "expected_count"):
        assert f'"{staff_only}"' not in text
