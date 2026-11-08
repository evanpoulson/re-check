"""Staff sign-in with Auth0. Auth0 is mocked: a local RSA key signs the ID tokens."""

import time
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from recheck import oidc
from recheck.auth import STAFF_COOKIE, encode_signed
from recheck.main import create_app

from test_health import FakePool

DOMAIN = "recheck-test.ca.auth0.com"
CLIENT_ID = "test-client-id"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ENROL = {"submission_id": "8b7c7d0c-58a5-4bd4-9b8f-0b0e4d6f3e11", "ctas": 3, "complaint_group": "chest_back_pain",
         "language": "en", "channel": "phone"}


@pytest.fixture(autouse=True)
def auth0_env(monkeypatch):
    monkeypatch.setenv("AUTH0_DOMAIN", DOMAIN)
    monkeypatch.setenv("AUTH0_CLIENT_ID", CLIENT_ID)
    monkeypatch.setenv("AUTH0_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("RECHECK_PUBLIC_URL", "http://localhost:5173")
    monkeypatch.setenv("RECHECK_DEMO_STAFF", "false")

    async def signing_key(cfg, id_token):
        return KEY.public_key()

    monkeypatch.setattr(oidc, "signing_key", signing_key)


def id_token(nonce: str, **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": f"https://{DOMAIN}/",
        "aud": CLIENT_ID,
        "sub": "google-oauth2|1234567890",
        "iat": now,
        "exp": now + 3600,
        "nonce": nonce,
        "name": "Dr. Test",
        oidc.ROLES_CLAIM: ["physician"],
        **overrides,
    }
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, KEY, algorithm="RS256")


def client() -> TestClient:
    # Don't follow redirects: they point at Auth0 and the web app.
    return TestClient(create_app(FakePool()), follow_redirects=False)


def start(c: TestClient, return_to: str = "/staff/physician") -> dict[str, str]:
    r = c.get("/api/staff/login", params={"return_to": return_to})
    assert r.status_code == 302
    url = urlparse(r.headers["location"])
    assert url.netloc == DOMAIN and url.path == "/authorize"
    return {k: v[0] for k, v in parse_qs(url.query).items()}


def finish(c: TestClient, monkeypatch, params: dict[str, str], token: str, state: str | None = None):
    seen = {}

    async def exchange_code(cfg, code, verifier):
        seen["code"], seen["verifier"] = code, verifier
        return token

    monkeypatch.setattr(oidc, "exchange_code", exchange_code)
    r = c.get("/api/staff/callback", params={"code": "one-time-code", "state": state or params["state"]})
    return r, seen


def test_login_redirects_to_auth0_with_pkce_and_state():
    with client() as c:
        params = start(c)
        assert params["response_type"] == "code"
        assert params["client_id"] == CLIENT_ID
        assert params["redirect_uri"] == "http://localhost:5173/api/staff/callback"
        assert params["code_challenge_method"] == "S256"
        assert params["scope"] == "openid profile email"
        assert params["state"] and params["nonce"]
        cookie = c.cookies.get("recheck_sign_in")
        assert cookie and params["state"] not in cookie  # the flow cookie is opaque


def test_full_sign_in_sets_staff_cookie_and_real_actor(monkeypatch):
    with client() as c:
        params = start(c)
        r, seen = finish(c, monkeypatch, params, id_token(params["nonce"]))
        assert r.status_code == 302
        assert r.headers["location"] == "http://localhost:5173/staff/physician"
        assert seen["code"] == "one-time-code" and oidc._challenge(seen["verifier"]) == params["code_challenge"]
        assert "httponly" in r.headers["set-cookie"].lower()
        me = c.get("/api/staff/session").json()
        assert me == {"user_id": "google-oauth2|1234567890", "name": "Dr. Test", "role": "physician",
                      "site_id": "foothills-demo"}
        # The role from Auth0 is enforced: a physician can't enrol.
        assert c.post("/api/visits", json=ENROL).status_code == 403


def test_nonce_mismatch_is_rejected(monkeypatch):
    with client() as c:
        params = start(c)
        r, _ = finish(c, monkeypatch, params, id_token("some-other-nonce"))
        assert r.headers["location"].endswith("/staff/sign-in?error=sign_in_failed")
        assert c.get("/api/staff/session").status_code == 401


def test_state_mismatch_is_rejected(monkeypatch):
    with client() as c:
        params = start(c)
        r, seen = finish(c, monkeypatch, params, id_token(params["nonce"]), state="forged")
        assert r.headers["location"].endswith("?error=sign_in_failed")
        assert seen == {}  # never reached Auth0


def test_callback_without_a_started_sign_in_is_expired(monkeypatch):
    with client() as c:
        r, _ = finish(c, monkeypatch, {"state": "x"}, id_token("x"))
        assert r.headers["location"].endswith("?error=expired")


@pytest.mark.parametrize("roles", [None, [], ["admin"], ["physician", "triage_nurse"]])
def test_account_needs_exactly_one_staff_role(monkeypatch, roles):
    with client() as c:
        params = start(c)
        token = id_token(params["nonce"], **{oidc.ROLES_CLAIM: roles})
        r, _ = finish(c, monkeypatch, params, token)
        assert r.headers["location"].endswith("?error=no_staff_role")
        assert c.get("/api/staff/session").status_code == 401


@pytest.mark.parametrize("overrides", [{"aud": "another-app"}, {"iss": "https://evil.example/"}, {"exp": 1}])
def test_bad_id_token_is_rejected(monkeypatch, overrides):
    with client() as c:
        params = start(c)
        r, _ = finish(c, monkeypatch, params, id_token(params["nonce"], **overrides))
        assert r.headers["location"].endswith("?error=sign_in_failed")


def test_token_signed_by_another_key_is_rejected(monkeypatch):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with client() as c:
        params = start(c)
        now = int(time.time())
        token = jwt.encode({"iss": f"https://{DOMAIN}/", "aud": CLIENT_ID, "sub": "x", "iat": now, "exp": now + 60,
                            "nonce": params["nonce"], oidc.ROLES_CLAIM: ["physician"]}, other, algorithm="RS256")
        r, _ = finish(c, monkeypatch, params, token)
        assert r.headers["location"].endswith("?error=sign_in_failed")


def test_auth0_refusal_goes_back_to_sign_in():
    with client() as c:
        start(c)
        r = c.get("/api/staff/callback", params={"error": "access_denied", "error_description": "not on the staff list"})
        assert r.headers["location"] == "http://localhost:5173/staff/sign-in?error=access_denied"


@pytest.mark.parametrize("return_to", ["https://evil.example/", "//evil.example/", "/\\evil.example", "staff"])
def test_return_to_stays_on_this_site(monkeypatch, return_to):
    with client() as c:
        params = start(c, return_to)
        r, _ = finish(c, monkeypatch, params, id_token(params["nonce"]))
        assert r.headers["location"] == "http://localhost:5173/"


def test_logout_ends_the_auth0_session_too(monkeypatch):
    with client() as c:
        params = start(c)
        finish(c, monkeypatch, params, id_token(params["nonce"]))
        r = c.get("/api/staff/logout")
        url = urlparse(r.headers["location"])
        assert url.netloc == DOMAIN and url.path == "/v2/logout"
        assert parse_qs(url.query)["returnTo"] == ["http://localhost:5173/staff/sign-in"]
        assert c.get("/api/staff/session").status_code == 401


def test_demo_picker_is_off_by_default():
    with client() as c:
        assert c.post("/api/staff/session", json={"role": "charge_nurse"}).status_code == 403
        assert c.get("/api/staff/sign-in-options").json() == {"auth0": True, "demo": False}


def test_login_without_auth0_config_is_503(monkeypatch):
    # Empty, not deleted: settings reload the root .env, which only fills unset variables.
    monkeypatch.setenv("AUTH0_CLIENT_SECRET", "")
    with client() as c:
        assert c.get("/api/staff/login").status_code == 503
        assert c.get("/api/staff/sign-in-options").json()["auth0"] is False


def test_expired_staff_cookie_is_rejected():
    with client() as c:
        c.cookies.set(STAFF_COOKIE, encode_signed(
            {"sub": "auth0|x", "role": "charge_nurse", "site": "foothills-demo", "name": None, "exp": int(time.time()) - 1}
        ))
        assert c.get("/api/staff/session").status_code == 401


def test_sign_in_flow_cookie_cant_be_used_as_staff_cookie():
    with client() as c:
        c.get("/api/staff/login")
        c.cookies.set(STAFF_COOKIE, c.cookies.get("recheck_sign_in"))
        assert c.get("/api/staff/session").status_code == 401
