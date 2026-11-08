"""Who is calling: staff (demo role cookie) or a patient device (visit-session cookie).

Staff sign-in is a stand-in. The web app's demo role picker calls
`POST /api/staff/session`; the server answers with a signed HttpOnly cookie, and
every staff route reads the role, site and actor from it. Auth0 (or any real
sign-in) replaces `sign_in_demo_staff` and `current_staff` without touching the
routes.
"""

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, Response, status
from psycopg_pool import AsyncConnectionPool

from .contract.codes import Reporter, StaffRole
from .security import sign, token_hash, unsign
from .settings import cookie_secure, site_id

STAFF_COOKIE = "recheck_staff"
SESSION_COOKIE = "recheck_session"


def get_pool(request: Request) -> AsyncConnectionPool:
    return request.app.state.pool


Pool = Annotated[AsyncConnectionPool, Depends(get_pool)]


# ---------------------------------------------------------------------------
# Staff
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Staff:
    role: StaffRole
    site_id: str

    @property
    def actor(self) -> str:
        # Demo identity: the role, not a person. Real sign-in puts a user ID here.
        return f"demo|{self.role.value}"


def set_staff_cookie(response: Response, staff: Staff) -> None:
    response.set_cookie(
        STAFF_COOKIE,
        sign(f"{staff.role.value}|{staff.site_id}"),
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )


def clear_staff_cookie(response: Response) -> None:
    response.delete_cookie(STAFF_COOKIE, path="/")


def demo_staff(role: StaffRole) -> Staff:
    return Staff(role=role, site_id=site_id())


def current_staff(request: Request) -> Staff:
    raw = request.cookies.get(STAFF_COOKIE)
    value = unsign(raw) if raw else None
    if value is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "staff sign-in required")
    role, _, site = value.partition("|")
    try:
        return Staff(role=StaffRole(role), site_id=site)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "staff sign-in required") from None


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
