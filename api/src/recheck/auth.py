"""Who is calling: staff (signed staff cookie) or a patient device (visit-session cookie).

Staff sign in with Auth0 (`routes/staff_session.py`, `oidc.py`). The callback
sets a signed HttpOnly cookie, and every staff route reads the user, role and
site from it through `current_staff`. The demo role picker sets the same cookie
when `RECHECK_DEMO_STAFF` is on.
"""

import base64
import json
import time
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, Response, status
from psycopg_pool import AsyncConnectionPool

from .contract.codes import Reporter, StaffRole
from .security import STAFF_COOKIE_KEY, sign, token_hash, unsign
from .settings import cookie_secure, site_id

STAFF_COOKIE = "recheck_staff"
SESSION_COOKIE = "recheck_session"
# One shift. After this the person signs in again (Auth0 may sign them straight back in).
STAFF_SESSION_SECONDS = 12 * 60 * 60


def get_pool(request: Request) -> AsyncConnectionPool:
    return request.app.state.pool


Pool = Annotated[AsyncConnectionPool, Depends(get_pool)]


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Staff:
    # Auth0 user ID (`google-oauth2|123`, `auth0|abc`), or `demo|<role>` from the role picker.
    user_id: str
    role: StaffRole
    site_id: str
    name: str | None = None

    @property
    def actor(self) -> str:
        """Who the audit log and `*_by` columns record."""
        return self.user_id


def encode_signed(payload: dict, purpose: bytes = STAFF_COOKIE_KEY) -> str:
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    return sign(raw, purpose)


def decode_signed(value: str, purpose: bytes = STAFF_COOKIE_KEY) -> dict | None:
    """The payload if the signature is good and `exp` hasn't passed; otherwise None."""
    raw = unsign(value, purpose)
    if raw is None:
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    except ValueError:
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("exp"), int) or payload["exp"] < time.time():
        return None
    return payload


def set_staff_cookie(response: Response, staff: Staff) -> None:
    payload = {
        "sub": staff.user_id,
        "role": staff.role.value,
        "site": staff.site_id,
        "name": staff.name,
        "exp": int(time.time()) + STAFF_SESSION_SECONDS,
    }
    response.set_cookie(
        STAFF_COOKIE,
        encode_signed(payload),
        max_age=STAFF_SESSION_SECONDS,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )


def clear_staff_cookie(response: Response) -> None:
    response.delete_cookie(STAFF_COOKIE, path="/")


def demo_staff(role: StaffRole) -> Staff:
    return Staff(user_id=f"demo|{role.value}", role=role, site_id=site_id())


def current_staff(request: Request) -> Staff:
    raw = request.cookies.get(STAFF_COOKIE)
    payload = decode_signed(raw) if raw else None
    if payload is not None:
        try:
            return Staff(
                user_id=str(payload["sub"]),
                role=StaffRole(payload["role"]),
                site_id=str(payload["site"]),
                name=payload.get("name"),
            )
        except (KeyError, ValueError):
            pass
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "staff sign-in required")


def require_staff(*roles: StaffRole):
    """Dependency: a signed-in staff member with one of `roles`."""

    def check(staff: Annotated[Staff, Depends(current_staff)]) -> Staff:
        if staff.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"{staff.role.value} can't do this")
        return staff

    return check


# Who may enrol patients, re-show QRs and sign a lost device out.
DESK_ROLES = (StaffRole.TRIAGE_NURSE, StaffRole.CHARGE_NURSE)
DeskStaff = Annotated[Staff, Depends(require_staff(*DESK_ROLES))]


# ---------------------------------------------------------------------------
# Patient or companion device
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class VisitSession:
    session_id: UUID
    visit_id: UUID
    role: Reporter

    @property
    def actor(self) -> str:
        return f"{self.role.value}|session:{self.session_id}"


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/api",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/api")


def session_cookie_hash(request: Request) -> bytes | None:
    raw = request.cookies.get(SESSION_COOKIE)
    return token_hash(raw) if raw else None


async def current_visit_session(request: Request, pool: Pool) -> VisitSession:
    """The open session for this device's cookie. 401 once it's signed out or the visit has closed."""
    digest = session_cookie_hash(request)
    if digest is not None:
        async with pool.connection() as conn:
            cur = await conn.execute(
                "SELECT id, visit_id, role FROM visit_session WHERE session_hash = %s AND revoked_at IS NULL",
                [digest],
            )
            row = await cur.fetchone()
        if row:
            return VisitSession(session_id=row[0], visit_id=row[1], role=Reporter(row[2]))
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "scan the visit's QR code to sign in")
