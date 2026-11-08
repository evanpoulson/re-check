"""Patient side of sign-in: trade the QR token for a visit-session cookie, and sign out."""

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from psycopg import errors

from ..auth import Pool, clear_session_cookie, session_cookie_hash, set_session_cookie
from ..contract.visits import SessionInfo, SignInConflict, SignOut, TokenExchange
from ..db import write_tx
from ..security import new_token, token_hash
from .. import submissions

router = APIRouter(prefix="/api/session", tags=["patient session"])


def _conflict(row) -> JSONResponse:
    session_id, role, created_at = row
    body = SignInConflict(session_id=session_id, signed_in_as=role, signed_in_since=created_at)
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=body.model_dump(mode="json"))


@router.post(
    "",
    response_model=SessionInfo,
    responses={
        404: {"description": "Not a Recheck QR code"},
        409: {"model": SignInConflict, "description": "Another device is signed in; confirm to take over"},
        410: {"description": "The visit has closed or no longer offers the app"},
    },
)
async def exchange_token(body: TokenExchange, response: Response, pool: Pool) -> SessionInfo | JSONResponse:
    """A device scans the visit's QR, says who is using it, and gets an HttpOnly session cookie.

    One device per visit. If another is signed in, the answer is 409 with that
    session; resend with `takeover_session_id` once the person confirms.
    """
    session_token = new_token()
    try:
        # The actor is refined to the visit once it's known; the lookup itself writes nothing.
        async with write_tx(pool, "patient|sign-in") as conn:
            # Lock the visit so two devices signing in at once queue up rather than race.
            cur = await conn.execute(
                "SELECT id, status, app_exclusion, language FROM visit WHERE token_hash = %s FOR UPDATE",
                [token_hash(body.token)],
            )
            visit = await cur.fetchone()
            if visit is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "this QR code isn't recognised")
            visit_id, visit_status, exclusion, language = visit
            if visit_status != "waiting" or exclusion is not None:
                raise HTTPException(status.HTTP_410_GONE, "this visit's QR code no longer works")

            await conn.execute(
                "SELECT set_config('app.actor', %s, true)", [f"{body.role.value}|visit:{visit_id}"]
            )
            cur = await conn.execute(
                "SELECT id, role, created_at FROM visit_session WHERE visit_id = %s AND revoked_at IS NULL",
                [visit_id],
            )
            open_session = await cur.fetchone()
            replaces = None
            if open_session is not None:
                if body.takeover_session_id != open_session[0]:
                    return _conflict(open_session)
                await conn.execute(
                    "UPDATE visit_session SET revoked_at = now(), revoked_reason = 'takeover' WHERE id = %s",
                    [open_session[0]],
                )
                replaces = open_session[0]
            await conn.execute(
                "INSERT INTO visit_session (visit_id, role, session_hash, replaces) VALUES (%s, %s, %s, %s)",
                [visit_id, body.role, token_hash(session_token), replaces],
            )
    except errors.UniqueViolation:
        # Lost a race with another sign-in despite the lock; report whoever won.
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT s.id, s.role, s.created_at FROM visit_session s JOIN visit v ON v.id = s.visit_id "
                "WHERE v.token_hash = %s AND s.revoked_at IS NULL",
                [token_hash(body.token)],
            )
            row = await cur.fetchone()
        if row is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "sign-in clashed with another device; try again") from None
        return _conflict(row)

    set_session_cookie(response, session_token)
    return SessionInfo(role=body.role, language=language, replaced_other_device=replaces is not None)


@router.post("/sign-out", status_code=status.HTTP_204_NO_CONTENT)
async def sign_out(body: SignOut, request: Request, pool: Pool) -> Response:
    """Sign this device out. The visit's QR still works for the next sign-in.

    Always clears the cookie, and succeeds if the session had already ended, so a retry is harmless.
    """
    digest = session_cookie_hash(request)
    if digest is not None:
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT id, visit_id, role, revoked_at FROM visit_session WHERE session_hash = %s", [digest]
            )
            row = await cur.fetchone()
        if row is not None and row[3] is None:
            session_id, visit_id, role, _ = row
            actor = f"{role}|session:{session_id}"
            endpoint = "session.sign_out"
            fp = submissions.fingerprint(body)
            async with write_tx(pool, actor) as conn:
                if await submissions.find(conn, body.submission_id, actor=actor, endpoint=endpoint, fp=fp) is None:
                    await conn.execute(
                        "UPDATE visit_session SET revoked_at = now(), revoked_reason = 'signed_out' "
                        "WHERE id = %s AND revoked_at IS NULL",
                        [session_id],
                    )
                    await submissions.record(
                        conn, body.submission_id, actor=actor, endpoint=endpoint, fp=fp, visit_id=visit_id
                    )
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response
