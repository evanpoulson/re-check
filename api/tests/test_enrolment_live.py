"""Enrolment and QR sign-in against the real database, rolled back after each test."""

from uuid import uuid4

import pytest

pytestmark = pytest.mark.live


def sid() -> str:
    return str(uuid4())


def as_staff(client, role="triage_nurse"):
    assert client.post("/api/staff/session", json={"role": role}).status_code == 200


def enrol(client, **overrides):
    body = {"submission_id": sid(), "ctas": 3, "complaint_group": "chest_back_pain", "language": "pa", "channel": "phone"}
    body.update(overrides)
    return client.post("/api/visits", json=body), body


def token_of(link: str) -> str:
    assert "/v/" in link
    return link.rsplit("/v/", 1)[1]


def as_new_device(client):
    """Forget the patient cookie, as a second phone would."""
    client.cookies.delete("recheck_session", path="/api")


def scalar(client, sql, *params):
    import asyncio

    pool = client.app.state.pool

    async def run():
        async with pool.connection() as conn:
            cur = await conn.execute(sql, list(params))
            return (await cur.fetchone())[0]

    return client.portal.call(run)


# --- enrolment ---------------------------------------------------------------


def test_enrol_returns_link_and_stores_only_hash_and_ciphertext(live_client):
    as_staff(live_client)
    r, _ = enrol(live_client)
    assert r.status_code == 201, r.text
    out = r.json()
    token = token_of(out["link"])
    assert out["app_exclusion"] is None and out["pager_no"] is None
    row = scalar(
        live_client,
        "SELECT json_build_object('site', site_id, 'lang', language, 'hash_len', octet_length(token_hash),"
        " 'cipher_has_token', position(convert_to(%s, 'UTF8') in token_ciphertext) > 0,"
        " 'prompt_due', next_prompt_due_at IS NOT NULL, 'staff_due', staff_reassess_due_at IS NOT NULL)"
        " FROM visit WHERE id = %s",
        token,
        out["visit_id"],
    )
    assert row == {"site": "foothills-demo", "lang": "pa", "hash_len": 32, "cipher_has_token": False,
                   "prompt_due": True, "staff_due": True}


def test_enrol_retry_returns_same_visit_and_reused_id_is_refused(live_client):
    as_staff(live_client)
    first, body = enrol(live_client)
    again = live_client.post("/api/visits", json=body)
    assert again.status_code == 200
    assert again.json() == first.json()
    other = live_client.post("/api/visits", json={**body, "ctas": 4})
    assert other.status_code == 409


def test_enrol_without_app_has_no_link(live_client):
    as_staff(live_client)
    r, _ = enrol(live_client, channel=None, app_exclusion="child")
    assert r.status_code == 201, r.text
    assert r.json()["link"] is None


def test_pager_cant_go_to_two_waiting_patients(live_client):
    as_staff(live_client)
    pager = str(900000 + uuid4().int % 99999)
    assert enrol(live_client, channel="pager", pager_no=pager)[0].status_code == 201
    r, _ = enrol(live_client, channel="pager", pager_no=pager)
    assert r.status_code == 409
    assert "pager" in r.json()["detail"]


def test_desk_can_reshow_the_same_qr_and_it_is_audited(live_client):
    as_staff(live_client)
    out = enrol(live_client)[0].json()
    r = live_client.get(f"/api/visits/{out['visit_id']}/link")
    assert r.status_code == 200, r.text
    assert r.json()["link"] == out["link"]
    shown = scalar(
        live_client,
        "SELECT count(*) FROM audit_log WHERE event = 'visit.qr_shown' AND payload->>'visit_id' = %s",
        out["visit_id"],
    )
    assert shown == 1


def test_seeded_visit_qr_cant_be_reshown(live_client):
    as_staff(live_client)
    seeded = scalar(
        live_client,
        "SELECT id::text FROM visit WHERE site_id = 'foothills-demo' AND status = 'waiting'"
        " AND app_exclusion IS NULL LIMIT 1",
    )
    if seeded is None:
        pytest.skip("no seeded waiting visit")
    r = live_client.get(f"/api/visits/{seeded}/link")
    assert r.status_code == 409


# --- QR sign-in --------------------------------------------------------------


def test_unknown_qr_is_404(live_client):
    r = live_client.post("/api/session", json={"token": "x" * 43, "role": "patient"})
    assert r.status_code == 404


def test_sign_in_takeover_and_sign_out(live_client):
    as_staff(live_client)
    out = enrol(live_client)[0].json()
    token = token_of(out["link"])

    first = live_client.post("/api/session", json={"token": token, "role": "patient"})
    assert first.status_code == 200, first.text
    assert first.json() == {"role": "patient", "language": "pa", "replaced_other_device": False}
    set_cookie = first.headers["set-cookie"].lower()
    assert "recheck_session=" in set_cookie and "httponly" in set_cookie

    # A second phone is told someone is signed in, and who.
    as_new_device(live_client)
    conflict = live_client.post("/api/session", json={"token": token, "role": "companion"})
    assert conflict.status_code == 409
    assert conflict.json()["signed_in_as"] == "patient"
    session_id = conflict.json()["session_id"]

    # Confirming with a stale session ID is refused, not a silent takeover.
    stale = live_client.post("/api/session", json={"token": token, "role": "companion", "takeover_session_id": sid()})
    assert stale.status_code == 409

    took = live_client.post(
        "/api/session", json={"token": token, "role": "companion", "takeover_session_id": session_id}
    )
    assert took.status_code == 200, took.text
    assert took.json()["replaced_other_device"] is True
    assert scalar(
        live_client, "SELECT revoked_reason::text FROM visit_session WHERE id = %s", session_id
    ) == "takeover"

    # The companion signs out; the QR still works for the next sign-in.
    out_resp = live_client.post("/api/session/sign-out", json={"submission_id": sid()})
    assert out_resp.status_code == 204
    open_count = scalar(
        live_client, "SELECT count(*) FROM visit_session WHERE visit_id = %s AND revoked_at IS NULL", out["visit_id"]
    )
    assert open_count == 0
    assert live_client.post("/api/session", json={"token": token, "role": "patient"}).status_code == 200


def test_staff_can_sign_a_lost_device_out(live_client):
    as_staff(live_client)
    out = enrol(live_client)[0].json()
    assert live_client.post("/api/session", json={"token": token_of(out["link"]), "role": "patient"}).status_code == 200
    body = {"submission_id": sid()}
    path = f"/api/visits/{out['visit_id']}/sign-out"
    assert live_client.post(path, json=body).status_code == 204
    assert live_client.post(path, json=body).status_code == 204  # retry is harmless
    reason = scalar(
        live_client,
        "SELECT revoked_reason::text FROM visit_session WHERE visit_id = %s ORDER BY created_at DESC LIMIT 1",
        out["visit_id"],
    )
    assert reason == "staff_signed_out"


def test_closed_visit_qr_is_410(live_client):
    as_staff(live_client)
    out = enrol(live_client)[0].json()

    async def close():
        async with live_client.app.state.pool.connection() as conn:
            await conn.execute("SELECT set_config('app.actor', 'test|close', true)")
            await conn.execute("UPDATE visit SET status = 'left', closed_at = now() WHERE id = %s", [out["visit_id"]])

    live_client.portal.call(close)
    r = live_client.post("/api/session", json={"token": token_of(out["link"]), "role": "patient"})
    assert r.status_code == 410
