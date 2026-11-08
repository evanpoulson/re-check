"""Check-in reminders without a database: slot timing, endpoint and key checks, sending, and the config route."""

import base64
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from hypothesis import given
from hypothesis import strategies as st
from pywebpush import WebPushException

from recheck import push
from recheck.auth import VisitSession, current_visit_session
from recheck.contract.codes import Reporter
from recheck.main import create_app
from recheck.settings import Vapid

from test_health import FakePool

DUE = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)
CTAS_INTERVALS = [timedelta(minutes=m) for m in (15, 30, 60, 120)]


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def browser_keys() -> dict:
    point = ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return {"p256dh": b64(point), "auth": b64(bytes(range(16)))}


# --- when reminders go --------------------------------------------------------


def test_first_reminder_is_at_the_due_time_then_every_five_minutes():
    interval = timedelta(minutes=30)
    assert push.reminder_slot(DUE, interval, DUE - timedelta(seconds=1)) is None
    assert push.reminder_slot(DUE, interval, DUE) == 0
    assert push.reminder_slot(DUE, interval, DUE + timedelta(minutes=4, seconds=59)) == 0
    assert push.reminder_slot(DUE, interval, DUE + timedelta(minutes=5)) == 1
    assert push.reminder_slot(DUE, interval, DUE + timedelta(minutes=29, seconds=59)) == 5


def test_reminders_stop_one_interval_after_the_due_time():
    for interval in CTAS_INTERVALS:
        assert push.reminder_slot(DUE, interval, DUE + interval) is None
        assert push.reminder_slot(DUE, interval, DUE + interval - timedelta(seconds=1)) == interval // push.REMINDER_EVERY - 1


def test_ctas_2_gets_three_reminders_and_ctas_5_gets_twenty_four():
    def slots(interval):
        return {push.reminder_slot(DUE, interval, DUE + timedelta(seconds=s)) for s in range(0, 3 * 3600, 30)} - {None}

    assert slots(timedelta(minutes=15)) == {0, 1, 2}
    assert slots(timedelta(minutes=120)) == set(range(24))


@given(st.sampled_from(CTAS_INTERVALS), st.integers(min_value=-3 * 3600, max_value=3 * 3600))
def test_a_slot_is_the_latest_five_minute_mark_inside_the_interval(interval, offset_seconds):
    now = DUE + timedelta(seconds=offset_seconds)
    slot = push.reminder_slot(DUE, interval, now)
    if slot is None:
        assert now < DUE or now >= DUE + interval
    else:
        assert DUE + slot * push.REMINDER_EVERY <= now < DUE + (slot + 1) * push.REMINDER_EVERY
        assert now < DUE + interval


# --- what the server accepts --------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "https://fcm.googleapis.com/fcm/send/abc:def",
        "https://web.push.apple.com/QAbc",
        "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
        "https://wns2-by3p.notify.windows.com/w/?token=abc",
    ],
)
def test_known_push_services_are_allowed(url):
    assert push.allowed_endpoint(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://fcm.googleapis.com/fcm/send/abc",
        "https://example.com/push",
        "https://push.apple.com/abc",
        "https://web.push.apple.com.example.com/abc",
        "https://fcm.googleapis.com:8443/fcm/send/abc",
        "https://user:pw@fcm.googleapis.com/fcm/send/abc",
        "https://127.0.0.1/push",
        "https://[::1",
    ],
)
def test_other_addresses_are_refused(url):
    assert not push.allowed_endpoint(url)


def test_browser_keys_are_checked_and_unpadded():
    keys = browser_keys()
    assert push.subscription_keys(keys["p256dh"] + "=", keys["auth"] + "==") == (keys["p256dh"], keys["auth"])
    assert push.subscription_keys(keys["p256dh"][:-4], keys["auth"]) is None
    assert push.subscription_keys(keys["p256dh"], b64(bytes(15))) is None
    assert push.subscription_keys("A" + keys["p256dh"][1:], keys["auth"]) is None  # not an uncompressed point


def test_keygen_gives_a_key_pair_browsers_accept():
    private, public = push.keygen()
    assert len(base64.urlsafe_b64decode(private + "=")) == 32
    point = base64.urlsafe_b64decode(public + "=")
    assert len(point) == 65 and point[0] == 4
    assert push.public_key(private) == public


# --- sending ----------------------------------------------------------------


REMINDER = push.Reminder(uuid4(), uuid4(), "https://fcm.googleapis.com/fcm/send/x", "p", "a")
SETTINGS = Vapid(private_key="unused", subject="mailto:demo@example.com")


def test_the_reminder_says_only_that_a_check_in_is_due(monkeypatch):
    calls = []

    def fake_webpush(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(status_code=201)

    monkeypatch.setattr(push, "webpush", fake_webpush)
    assert push.deliver(REMINDER, SETTINGS, signer=object()) == push.Result("sent", 201)
    (call,) = calls
    assert json.loads(call["data"]) == {
        "kind": "checkin_due", "title": "Recheck", "body": "It's time for your check-in.", "url": "/check-in",
    }
    assert call["headers"]["Topic"] == "recheck-checkin" and call["headers"]["Urgency"] == "high"
    assert call["ttl"] == 300
    assert call["vapid_claims"] == {"sub": "mailto:demo@example.com"}


@pytest.mark.parametrize(("status", "outcome"), [(404, "gone"), (410, "gone"), (429, "failed"), (500, "failed")])
def test_push_service_refusals_are_recorded(monkeypatch, status, outcome):
    def refuse(**kwargs):
        raise WebPushException("no", response=SimpleNamespace(status_code=status, text="", headers={}))

    monkeypatch.setattr(push, "webpush", refuse)
    assert push.deliver(REMINDER, SETTINGS, signer=object()) == push.Result(outcome, status)


def test_a_network_error_is_a_failure_not_a_crash(monkeypatch):
    def offline(**kwargs):
        raise ConnectionError("no route")

    monkeypatch.setattr(push, "webpush", offline)
    assert push.deliver(REMINDER, SETTINGS, signer=object()) == push.Result("failed", None)


# --- routes without a database --------------------------------------------------


@pytest.fixture
def device(monkeypatch):
    monkeypatch.delenv("RECHECK_VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("RECHECK_VAPID_SUBJECT", raising=False)
    app = create_app(FakePool())
    app.dependency_overrides[current_visit_session] = lambda: VisitSession(uuid4(), uuid4(), Reporter.PATIENT)
    with TestClient(app) as client:
        yield client


def test_reminders_are_off_without_a_key(device):
    assert device.get("/api/patient/push").json() == {"enabled": False, "public_key": None}
    saved = device.put(
        "/api/patient/push/subscription",
        json={"endpoint": "https://fcm.googleapis.com/fcm/send/x", "keys": browser_keys()},
    )
    assert saved.status_code == 409


def test_config_serves_the_public_key(device, monkeypatch):
    private, public = push.keygen()
    monkeypatch.setenv("RECHECK_VAPID_PRIVATE_KEY", private)
    monkeypatch.setenv("RECHECK_VAPID_SUBJECT", "mailto:demo@example.com")
    assert device.get("/api/patient/push").json() == {"enabled": True, "public_key": public}


def test_unknown_push_services_and_bad_keys_are_refused(device, monkeypatch):
    monkeypatch.setenv("RECHECK_VAPID_PRIVATE_KEY", push.keygen()[0])
    monkeypatch.setenv("RECHECK_VAPID_SUBJECT", "mailto:demo@example.com")
    elsewhere = {"endpoint": "https://example.com/push", "keys": browser_keys()}
    assert device.put("/api/patient/push/subscription", json=elsewhere).status_code == 422
    bad_keys = {"endpoint": "https://fcm.googleapis.com/fcm/send/x", "keys": {**browser_keys(), "auth": b64(bytes(30))}}
    assert device.put("/api/patient/push/subscription", json=bad_keys).status_code == 422


def test_routes_need_a_signed_in_device(monkeypatch):
    with TestClient(create_app(FakePool())) as client:
        assert client.get("/api/patient/push").status_code == 401
        assert client.delete("/api/patient/push/subscription").status_code == 401


def test_a_subject_that_is_not_a_contact_is_rejected(monkeypatch):
    from recheck.settings import vapid

    monkeypatch.setenv("RECHECK_VAPID_PRIVATE_KEY", "x")
    monkeypatch.setenv("RECHECK_VAPID_SUBJECT", "demo@example.com")
    with pytest.raises(RuntimeError, match="mailto"):
        vapid()
