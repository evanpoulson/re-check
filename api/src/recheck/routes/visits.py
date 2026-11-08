"""Staff side of enrolment: create a visit, re-show its QR, sign a lost device out."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status

from ..auth import DeskStaff, Pool
from ..contract.visits import StaffSignOut, VisitCreate, VisitEnrolled, VisitLink
from ..db import write_tx
from ..question_bank import EnrolmentConflict, check_enrolment, default_bank
from ..security import decrypt_token, encrypt_token, new_token, token_hash
from ..settings import public_url
from .. import events, submissions
from ..contract.codes import DashboardEventType

router = APIRouter(prefix="/api/visits", tags=["visits"])


def qr_link(token: str) -> str:
    return f"{public_url()}/v/{token}"


@router.post(
    "",
    response_model=VisitEnrolled,
    status_code=status.HTTP_201_CREATED,
    responses={
        409: {"description": "Pager already in use, or submission_id reused for a different request"},
        422: {"description": "Complaint group or exclusion contradicts the CEDIS map"},
    },
)
async def enrol_visit(body: VisitCreate, staff: DeskStaff, pool: Pool, response: Response) -> VisitEnrolled:
    """Triage enrols a waiting patient and gets the visit's QR link (none when the app isn't offered).

    Retrying with the same `submission_id` returns the same visit and link.
    """
    try:
        check_enrolment(default_bank(), body)
    except EnrolmentConflict as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from None
    endpoint = "visits.enrol"
    fp = submissions.fingerprint(body, site=staff.site_id)
    async with write_tx(pool, staff.actor) as conn:
        previous = await submissions.find(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp)
        if previous is not None:
            response.status_code = status.HTTP_200_OK
            return await _enrolled(conn, previous.visit_id)

        app = body.app_exclusion is None
        token = new_token() if app else None
        cur = await conn.execute(
            """
            INSERT INTO visit (site_id, ctas, complaint_group, cedis_code, language, app_exclusion,
                               channel, pager_no, token_hash, token_ciphertext)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            [
                staff.site_id,
                body.ctas,
                body.complaint_group,
                body.cedis_code,
                body.language,
                body.app_exclusion,
                body.channel,
                body.pager_no,
                token_hash(token) if token else None,
                encrypt_token(token) if token else None,
            ],
        )
        (visit_id,) = await cur.fetchone()
        await submissions.record(
            conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp, visit_id=visit_id
        )
        await events.notify(conn, DashboardEventType.VISIT_CHANGED, visit_id)
    return VisitEnrolled(
        visit_id=visit_id,
        app_exclusion=body.app_exclusion,
        link=qr_link(token) if token else None,
        pager_no=body.pager_no,
    )


async def _enrolled(conn, visit_id: UUID) -> VisitEnrolled:
    cur = await conn.execute(
        "SELECT app_exclusion, pager_no, token_ciphertext FROM visit WHERE id = %s", [visit_id]
    )
    exclusion, pager_no, ciphertext = await cur.fetchone()
    token = decrypt_token(ciphertext) if ciphertext else None
    return VisitEnrolled(
        visit_id=visit_id,
        app_exclusion=exclusion,
        link=qr_link(token) if token else None,
        pager_no=None if exclusion else pager_no,
    )


@router.get(
    "/{visit_id}/link",
    response_model=VisitLink,
    responses={
        404: {"description": "No such visit at this site"},
        409: {"description": "Visit is closed, doesn't offer the app, or its QR can't be re-shown"},
    },
)
async def show_visit_link(visit_id: UUID, staff: DeskStaff, pool: Pool) -> VisitLink:
    """The visit's QR again, for the desk to show. Each re-show is recorded in the audit log."""
    async with write_tx(pool, staff.actor) as conn:
        cur = await conn.execute(
            "SELECT status, app_exclusion, token_ciphertext FROM visit WHERE id = %s AND site_id = %s",
            [visit_id, staff.site_id],
        )
        row = await cur.fetchone()
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "visit not found")
        visit_status, exclusion, ciphertext = row
        if visit_status != "waiting" or exclusion is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "the QR only works while a visit is waiting and offers the app")
        token = decrypt_token(ciphertext) if ciphertext else None
        if token is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "this visit's QR can't be re-shown (seeded data, or a different RECHECK_SECRET_KEY)",
            )
        await conn.execute("SELECT log_qr_shown(%s)", [visit_id])
    return VisitLink(visit_id=visit_id, link=qr_link(token))


@router.post(
    "/{visit_id}/sign-out",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "No such visit at this site"}},
)
async def staff_sign_out_device(visit_id: UUID, body: StaffSignOut, staff: DeskStaff, pool: Pool) -> Response:
    """Sign out whichever device is signed in to the visit (for example a lost phone).

    Succeeds when no device is signed in, so a retry is harmless.
    """
    endpoint = "visits.session.sign_out"
    fp = submissions.fingerprint(body, visit=visit_id)
    async with write_tx(pool, staff.actor) as conn:
        cur = await conn.execute("SELECT 1 FROM visit WHERE id = %s AND site_id = %s", [visit_id, staff.site_id])
        if await cur.fetchone() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "visit not found")
        if await submissions.find(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp) is None:
            await conn.execute(
                """
                UPDATE visit_session SET revoked_at = now(), revoked_reason = 'staff_signed_out'
                WHERE visit_id = %s AND revoked_at IS NULL
                """,
                [visit_id],
            )
            await events.notify(conn, DashboardEventType.VISIT_CHANGED, visit_id)
            await submissions.record(
                conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp, visit_id=visit_id
            )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
