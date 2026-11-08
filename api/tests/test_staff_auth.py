"""Staff sign-in and role checks. No database needed: they fail before any query."""

from uuid import uuid4

from fastapi.testclient import TestClient

from recheck.main import create_app

from test_health import FakePool

ENROL = {"submission_id": str(uuid4()), "ctas": 3, "complaint_group": "chest_back_pain", "language": "en", "channel": "phone"}


def client() -> TestClient:
    return TestClient(create_app(FakePool()))


def test_staff_routes_need_sign_in():
    with client() as c:
        assert c.post("/api/visits", json=ENROL).status_code == 401
        assert c.get(f"/api/visits/{uuid4()}/link").status_code == 401
        assert c.get("/api/staff/session").status_code == 401


def test_physician_cant_enrol():
    with client() as c:
        assert c.post("/api/staff/session", json={"role": "physician"}).status_code == 200
        assert c.post("/api/visits", json=ENROL).status_code == 403


def test_demo_sign_in_round_trip():
    with client() as c:
        r = c.post("/api/staff/session", json={"role": "triage_nurse"})
        assert r.json() == {"user_id": "demo|triage_nurse", "name": None, "role": "triage_nurse", "site_id": "foothills-demo",
                            "demo_checkins": False}
        assert "httponly" in r.headers["set-cookie"].lower()
        assert c.get("/api/staff/session").json()["role"] == "triage_nurse"
        assert c.delete("/api/staff/session").status_code == 204
        assert c.get("/api/staff/session").status_code == 401


def test_forged_staff_cookie_is_rejected():
    with client() as c:
        c.cookies.set("recheck_staff", "charge_nurse|foothills-demo.AAAA")
        assert c.get("/api/staff/session").status_code == 401


def test_patient_sign_out_without_cookie_is_harmless():
    with client() as c:
        assert c.post("/api/session/sign-out", json={"submission_id": str(uuid4())}).status_code == 204


def test_unknown_fields_are_rejected():
    with client() as c:
        c.post("/api/staff/session", json={"role": "triage_nurse"})
        assert c.post("/api/visits", json={**ENROL, "name": "Jane"}).status_code == 422


def test_only_desk_staff_change_site_settings():
    with client() as c:
        assert c.get("/api/site-settings").status_code == 401
        assert c.put("/api/site-settings", json={"show_triage_level": True}).status_code == 401
        c.post("/api/staff/session", json={"role": "physician"})
        assert c.get("/api/site-settings").status_code == 403
        assert c.put("/api/site-settings", json={"show_triage_level": True}).status_code == 403
