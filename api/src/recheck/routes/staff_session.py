"""Staff sign-in: Auth0 (SSO or demo password accounts), plus an optional demo role picker.

Auth0 flow (see `recheck.oidc`):

    GET /api/staff/login?return_to=/staff/triage  -> 302 to Auth0
    GET /api/staff/callback?code=...&state=...     -> 302 to return_to, sets recheck_staff
    GET /api/staff/logout                          -> 302 via Auth0 logout to the sign-in page

These are browser navigations, not fetch calls. The models here aren't part of
the shared contract, so the web app's generated types don't change.
"""

import logging
import secrets
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict

from .. import oidc
from ..auth import (
    STAFF_COOKIE,
    Staff,
    clear_staff_cookie,
    current_staff,
    decode_signed,
    demo_staff,
    encode_signed,
    set_staff_cookie,
)
from ..contract.codes import StaffRole
from ..security import SIGN_IN_FLOW_KEY
from ..settings import auth0, cookie_secure, demo_checkins_enabled, demo_staff_enabled, public_url, site_id

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/staff", tags=["staff session"])

FLOW_COOKIE = "recheck_sign_in"
FLOW_COOKIE_PATH = "/api/staff/callback"
FLOW_SECONDS = 10 * 60
SIGN_IN_PAGE = "/staff/sign-in"


class DemoStaffSignIn(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    role: StaffRole


class StaffSessionInfo(BaseModel):
    model_config = ConfigDict(frozen=True)
    user_id: str
    name: str | None
    role: StaffRole
    site_id: str
    # Shows "Open check-in now" on the visit page (RECHECK_DEMO_CHECKINS).
    demo_checkins: bool


class SignInOptions(BaseModel):
    model_config = ConfigDict(frozen=True)
    auth0: bool
    demo: bool


def _info(staff: Staff) -> StaffSessionInfo:
    return StaffSessionInfo(
        user_id=staff.user_id, name=staff.name, role=staff.role, site_id=staff.site_id,
        demo_checkins=demo_checkins_enabled(),
    )


def _safe_return_to(value: str | None) -> str:
    """Only a path on this site, so the callback can't be used to redirect elsewhere."""
    if value and value.startswith("/") and not value.startswith(("//", "/\\")) and len(value) <= 512:
        return value
    return "/"


def _sign_in_page(error: str | None = None) -> str:
    return f"{public_url()}{SIGN_IN_PAGE}" + (f"?error={error}" if error else "")


@router.get("/sign-in-options", response_model=SignInOptions)
async def sign_in_options() -> SignInOptions:
    """Which sign-in buttons the sign-in page should show."""
    return SignInOptions(auth0=auth0() is not None, demo=demo_staff_enabled())


@router.get(
    "/login",
    status_code=status.HTTP_302_FOUND,
    responses={302: {"description": "Redirect to Auth0"}, 503: {"description": "Auth0 isn't configured"}},
)
async def login(return_to: str | None = None) -> RedirectResponse:
    """Start Auth0 sign-in. Open this as a page (link or `window.location`), not with fetch."""
    cfg = auth0()
    if cfg is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Auth0 sign-in isn't configured")
    flow = oidc.new_flow(_safe_return_to(return_to))
    response = RedirectResponse(oidc.authorize_url(cfg, flow), status_code=status.HTTP_302_FOUND)
    payload = {
        "state": flow.state,
        "nonce": flow.nonce,
        "verifier": flow.verifier,
        "return_to": flow.return_to,
        "exp": int(time.time()) + FLOW_SECONDS,
    }
    response.set_cookie(
        FLOW_COOKIE,
        encode_signed(payload, SIGN_IN_FLOW_KEY),
        max_age=FLOW_SECONDS,
        httponly=True,
        samesite="lax",  # sent on Auth0's top-level redirect back to the callback
        secure=cookie_secure(),
        path=FLOW_COOKIE_PATH,
    )
    return response


@router.get("/callback", status_code=status.HTTP_302_FOUND, responses={302: {"description": "Signed in, or back to sign-in with ?error="}})
async def callback(
    request: Request, code: str | None = None, state: str | None = None, error: str | None = None
) -> RedirectResponse:
    """Auth0 redirects here. Verify the sign-in, set the staff cookie and go to `return_to`.

    Failures go back to the sign-in page with `?error=`: `access_denied` (Auth0
    refused, for example an email not on the staff list), `no_staff_role`,
    `expired` (the sign-in took too long or was started in another browser) or
    `sign_in_failed`.
    """
    cfg = auth0()
    raw = request.cookies.get(FLOW_COOKIE)
    flow = decode_signed(raw, SIGN_IN_FLOW_KEY) if raw else None

    def fail(reason: str, detail: str) -> RedirectResponse:
        log.warning("staff sign-in failed (%s): %s", reason, detail)
        response = RedirectResponse(_sign_in_page(reason), status_code=status.HTTP_302_FOUND)
        response.delete_cookie(FLOW_COOKIE, path=FLOW_COOKIE_PATH)
        return response

    if cfg is None:
        return fail("sign_in_failed", "Auth0 isn't configured")
    if error:
        # Auth0's own error codes are short ASCII words; don't echo anything else.
        reason = error if error in ("access_denied", "login_required") else "sign_in_failed"
        return fail(reason, f"Auth0 returned {error}: {request.query_params.get('error_description', '')}")
    if flow is None:
        return fail("expired", "no sign-in in progress for this browser, or it expired")
    if not code or not state or not secrets.compare_digest(state, str(flow.get("state", ""))):
        return fail("sign_in_failed", "state doesn't match the sign-in this browser started")

    try:
        id_token = await oidc.exchange_code(cfg, code, str(flow["verifier"]))
        claims = await oidc.verify_id_token(cfg, id_token, str(flow["nonce"]))
        role = oidc.staff_role(claims)
    except oidc.SignInError as exc:
        return fail(exc.code, str(exc))

    staff = Staff(user_id=str(claims["sub"]), role=role, site_id=site_id(), name=oidc.display_name(claims))
    log.info("staff signed in: %s as %s", staff.user_id, staff.role.value)
    response = RedirectResponse(f"{public_url()}{_safe_return_to(flow.get('return_to'))}", status_code=status.HTTP_302_FOUND)
    response.delete_cookie(FLOW_COOKIE, path=FLOW_COOKIE_PATH)
    set_staff_cookie(response, staff)
    return response


@router.get("/logout", status_code=status.HTTP_302_FOUND, responses={302: {"description": "Signed out"}})
async def logout(request: Request) -> RedirectResponse:
    """Sign out of Recheck and Auth0, then return to the sign-in page. Open this as a page.

    Ending the Auth0 session too lets the next person at a shared workstation
    choose their own account. The sign-in page URL must be in the Auth0
    application's Allowed Logout URLs.
    """
    cfg = auth0()
    raw = request.cookies.get(STAFF_COOKIE)
    payload = decode_signed(raw) if raw else None
    was_auth0 = payload is not None and not str(payload.get("sub", "")).startswith("demo|")
    target = oidc.logout_url(cfg, _sign_in_page()) if cfg is not None and was_auth0 else _sign_in_page()
    response = RedirectResponse(target, status_code=status.HTTP_302_FOUND)
    clear_staff_cookie(response)
    return response


@router.post(
    "/session",
    response_model=StaffSessionInfo,
    tags=["staff session (demo)"],
    responses={403: {"description": "The demo role picker is turned off"}},
)
async def demo_sign_in(body: DemoStaffSignIn, response: Response) -> StaffSessionInfo:
    """Demo role picker: sign in as a role with no account. Only when `RECHECK_DEMO_STAFF` is on."""
    if not demo_staff_enabled():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "demo sign-in is turned off; sign in with Auth0")
    staff = demo_staff(body.role)
    set_staff_cookie(response, staff)
    return _info(staff)


@router.get("/session", response_model=StaffSessionInfo, responses={401: {"description": "Not signed in"}})
async def who_am_i(staff: Annotated[Staff, Depends(current_staff)]) -> StaffSessionInfo:
    return _info(staff)


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
async def sign_out() -> Response:
    """Clear the Recheck staff cookie only. Use `GET /api/staff/logout` to end the Auth0 session too."""
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_staff_cookie(response)
    return response
