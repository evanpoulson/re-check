"""Demo staff sign-in: pick a role, get a signed cookie.

Clearly a demo (the web app shows a DEMO badge). Replace with real sign-in
(Auth0) by changing `recheck.auth`; the models here aren't part of the shared
contract, so swapping this out doesn't change the web app's generated types.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict

from ..auth import Staff, clear_staff_cookie, current_staff, demo_staff, set_staff_cookie
from ..contract.codes import StaffRole

router = APIRouter(prefix="/api/staff/session", tags=["staff session (demo)"])


class DemoStaffSignIn(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    role: StaffRole


class StaffSessionInfo(BaseModel):
    model_config = ConfigDict(frozen=True)
    role: StaffRole
    site_id: str


@router.post("", response_model=StaffSessionInfo)
async def sign_in(body: DemoStaffSignIn, response: Response) -> StaffSessionInfo:
    staff = demo_staff(body.role)
    set_staff_cookie(response, staff)
    return StaffSessionInfo(role=staff.role, site_id=staff.site_id)


@router.get("", response_model=StaffSessionInfo, responses={401: {"description": "Not signed in"}})
async def who_am_i(staff: Annotated[Staff, Depends(current_staff)]) -> StaffSessionInfo:
    return StaffSessionInfo(role=staff.role, site_id=staff.site_id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def sign_out() -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_staff_cookie(response)
    return response
