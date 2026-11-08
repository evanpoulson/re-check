"""Staff actions: acknowledge and assess tasks, record vitals, flag higher, close or exclude a visit,
and (demo only) open a patient's check-in now.

Behaviour matches the web app's mock server (web/src/api/mocks/store.ts).
The acting staff member comes from the staff session; every write is
idempotent on its submission_id, and the database enforces escalate-only
(an acknowledgement can't be undone, a completed task can't change).
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import events, submissions, tasks, views
from ..auth import Pool, Staff, require_staff
from ..contract.codes import DashboardEventType, Disposition, StaffRole
from ..contract.staff import AcknowledgeTask, AssessTask, FlagHigher, FlagRecord, VitalsCreate, VitalsRecord
from ..contract.tasks import Task
from ..contract.visits import OpenCheckin, VisitExclusionUpdate, VisitStatusUpdate
from ..db import write_tx
from ..rules import STAFF_FLAG
from ..settings import demo_checkins_enabled

router = APIRouter(prefix="/api", tags=["staff actions"])

ClinicalStaff = Annotated[
    Staff, Depends(require_staff(StaffRole.TRIAGE_NURSE, StaffRole.PHYSICIAN, StaffRole.CHARGE_NURSE))
]
DeskStaff = Annotated[Staff, Depends(require_staff(StaffRole.TRIAGE_NURSE, StaffRole.CHARGE_NURSE))]
TriageNurse = Annotated[Staff, Depends(require_staff(StaffRole.TRIAGE_NURSE))]

# Assessment outcomes that end the wait, and the visit status they close it with (as the web mock does).
CLOSES_VISIT = {
    Disposition.ROOMED: "roomed",
    Disposition.TREATED_AND_RELEASED: "discharged",
    Disposition.LEFT_BEFORE_ASSESSMENT: "left",
    Disposition.NOT_LOCATED: "left",
}


def _not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _conflict(message: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, message)


async def _task_at_site(conn, task_id: UUID, site_id: str) -> tuple[UUID, str]:
    """(visit_id, status) of a task at the staff member's site, locked for this transaction."""
    cur = await conn.execute(
        "SELECT t.visit_id, t.status::text FROM task t JOIN visit v ON v.id = t.visit_id"
        " WHERE t.id = %s AND v.site_id = %s FOR UPDATE OF t",
        [task_id, site_id],
    )
    row = await cur.fetchone()
    if row is None:
        raise _not_found("task")
    return row


async def _visit_at_site(conn, visit_id: UUID, site_id: str, *, lock: bool = False):
    """(status, app_exclusion) of a visit at the staff member's site."""
    cur = await conn.execute(
        "SELECT status::text, app_exclusion::text FROM visit WHERE id = %s AND site_id = %s"
        + (" FOR UPDATE" if lock else ""),
        [visit_id, site_id],
    )
    row = await cur.fetchone()
    if row is None:
        raise _not_found("visit")
    return row


async def _task(conn, task_id: UUID, visit_id: UUID) -> Task:
    return next(t for t in await views.tasks_for(conn, [visit_id], open_only=False) if t.task_id == task_id)


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------


@router.post(
    "/tasks/{task_id}/acknowledge",
    response_model=Task,
    responses={404: {"description": "No such task at this site"}, 409: {"description": "Already acknowledged"}},
)
async def acknowledge_task(task_id: UUID, body: AcknowledgeTask, staff: ClinicalStaff, pool: Pool) -> Task:
    """ "I've seen this." Separate from assessment; it can't be undone."""
    endpoint = "tasks.acknowledge"
    fp = submissions.fingerprint(body, task=task_id)
    async with write_tx(pool, staff.actor) as conn:
        visit_id, task_status = await _task_at_site(conn, task_id, staff.site_id)
        if await submissions.find(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp) is None:
            if task_status != "open":
                raise _conflict("this task is already acknowledged")
            await conn.execute(
                "UPDATE task SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = %s,"
                " acknowledged_by_role = %s WHERE id = %s",
                [staff.actor, staff.role.value, task_id],
            )
            await events.notify(conn, DashboardEventType.TASK_CHANGED, visit_id, task_id)
            await submissions.record(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp,
                                     visit_id=visit_id)
        return await _task(conn, task_id, visit_id)


@router.post(
    "/tasks/{task_id}/assess",
    response_model=Task,
    responses={
        404: {"description": "No such task at this site"},
        409: {"description": "Not acknowledged yet, or already completed"},
    },
)
async def assess_task(task_id: UUID, body: AssessTask, staff: ClinicalStaff, pool: Pool) -> Task:
    """Record the in-person outcome and complete the task (FR16).

    Counts as a staff check: the staff reassessment timer restarts. Roomed,
    treated-and-released, left and not-located also close the visit.
    """
    endpoint = "tasks.assess"
    fp = submissions.fingerprint(body, task=task_id)
    async with write_tx(pool, staff.actor) as conn:
        visit_id, task_status = await _task_at_site(conn, task_id, staff.site_id)
        if await submissions.find(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp) is None:
            if task_status == "open":
                raise _conflict("acknowledge the task before assessing it")
            if task_status == "completed":
                raise _conflict("this task is already completed")
            await conn.execute(
                "UPDATE task SET status = 'completed', assessed_at = now(), assessed_by = %s, assessed_by_role = %s,"
                " disposition = %s WHERE id = %s",
                [staff.actor, staff.role.value, body.disposition.value, task_id],
            )
            await conn.execute(
                "UPDATE visit SET last_staff_check_at = now(), staff_reassess_due_at = now() + ctas_interval(ctas)"
                " WHERE id = %s AND status = 'waiting'",
                [visit_id],
            )
            closes = CLOSES_VISIT.get(body.disposition)
            if closes:
                await conn.execute(
                    "UPDATE visit SET status = %s, closed_at = now() WHERE id = %s AND status = 'waiting'",
                    [closes, visit_id],
                )
            await events.notify(conn, DashboardEventType.TASK_CHANGED, visit_id, task_id)
            await submissions.record(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp,
                                     visit_id=visit_id)
        return await _task(conn, task_id, visit_id)


# ---------------------------------------------------------------------------
# Vitals and flag higher
# ---------------------------------------------------------------------------


def _path_matches_body(path_id: UUID, body_id: UUID) -> None:
    if path_id != body_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "visit_id in the body must match the URL")


@router.post(
    "/visits/{visit_id}/vitals",
    response_model=VitalsRecord,
    status_code=status.HTTP_201_CREATED,
    responses={404: {"description": "No such visit at this site"}, 422: {"description": "Bad values or correction"}},
)
async def record_vitals(visit_id: UUID, body: VitalsCreate, staff: DeskStaff, pool: Pool, response: Response) -> VitalsRecord:
    """Repeat vitals (FR17). A correction names the record it supersedes; the original is kept."""
    _path_matches_body(visit_id, body.visit_id)
    endpoint = "visits.vitals"
    fp = submissions.fingerprint(body)
    async with write_tx(pool, staff.actor) as conn:
        await _visit_at_site(conn, visit_id, staff.site_id)
        if await submissions.find(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp) is not None:
            response.status_code = status.HTTP_200_OK
        else:
            if body.supersedes is not None:
                cur = await conn.execute(
                    "SELECT 1 FROM vitals WHERE id = %s AND visit_id = %s", [body.supersedes, visit_id]
                )
                if await cur.fetchone() is None:
                    raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "supersedes must be vitals from this visit")
            await conn.execute(
                "INSERT INTO vitals (id, visit_id, measured_at, sbp, dbp, hr, rr, spo2, temp_c, entered_by,"
                " entered_by_role, supersedes) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                [body.submission_id, visit_id, body.measured_at, body.sbp, body.dbp, body.hr, body.rr, body.spo2,
                 body.temp_c, staff.actor, staff.role.value, body.supersedes],
            )
            await conn.execute(
                "UPDATE visit SET last_staff_check_at = now() WHERE id = %s AND status = 'waiting'", [visit_id]
            )
            await events.notify(conn, DashboardEventType.VITALS_RECORDED, visit_id)
            await submissions.record(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp,
                                     visit_id=visit_id)
        records = await views.vitals_records(conn, visit_id)
    return next(v for v in records if v.vitals_id == body.submission_id)


@router.post(
    "/visits/{visit_id}/flag",
    response_model=FlagRecord,
    status_code=status.HTTP_201_CREATED,
    responses={404: {"description": "No such visit at this site"}, 409: {"description": "Visit is no longer waiting"}},
)
async def flag_higher(visit_id: UUID, body: FlagHigher, staff: TriageNurse, pool: Pool, response: Response) -> FlagRecord:
    """Triage nurse's one-tap "flag higher" (FR17): opens or raises an amber task for the physician."""
    _path_matches_body(visit_id, body.visit_id)
    endpoint = "visits.flag"
    fp = submissions.fingerprint(body)
    async with write_tx(pool, staff.actor) as conn:
        visit_status, _ = await _visit_at_site(conn, visit_id, staff.site_id, lock=True)
        if await submissions.find(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp) is not None:
            response.status_code = status.HTTP_200_OK
        else:
            if visit_status != "waiting":
                raise _conflict("this visit is no longer waiting")
            await conn.execute(
                "INSERT INTO report (id, visit_id, captured_at, kind, reporter, channel, note, entered_by)"
                " VALUES (%s, %s, now(), 'staff_flag', 'staff', 'desk', %s, %s)",
                [body.submission_id, visit_id, body.note, staff.actor],
            )
            await submissions.record(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp,
                                     visit_id=visit_id)
            task_id = await tasks.raise_task(
                conn, visit_id, [STAFF_FLAG], [{"kind": "flag", "id": str(body.submission_id)}]
            )
            await events.notify(conn, DashboardEventType.TASK_CHANGED, visit_id, task_id)
        rows = await views.reports_for(conn, [visit_id])
    return views.flag_record(next(r for r in rows if r["id"] == body.submission_id))


# ---------------------------------------------------------------------------
# Visit status and app exclusion
# ---------------------------------------------------------------------------


@router.post(
    "/visits/{visit_id}/status",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "No such visit at this site"}, 409: {"description": "Visit already closed"}},
)
async def set_visit_status(visit_id: UUID, body: VisitStatusUpdate, staff: ClinicalStaff, pool: Pool) -> Response:
    """Close the visit: roomed, left or discharged. Signs out its device; the QR stops working."""
    endpoint = "visits.status"
    fp = submissions.fingerprint(body, visit=visit_id)
    async with write_tx(pool, staff.actor) as conn:
        visit_status, _ = await _visit_at_site(conn, visit_id, staff.site_id, lock=True)
        if await submissions.find(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp) is None:
            if visit_status != "waiting":
                raise _conflict(f"this visit is already {visit_status}")
            await conn.execute(
                "UPDATE visit SET status = %s, closed_at = now() WHERE id = %s", [body.status.value, visit_id]
            )
            await events.notify(conn, DashboardEventType.VISIT_CHANGED, visit_id)
            await submissions.record(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp,
                                     visit_id=visit_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/visits/{visit_id}/exclusion",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "No such visit at this site"}, 409: {"description": "Already excluded"}},
)
async def set_exclusion(visit_id: UUID, body: VisitExclusionUpdate, staff: DeskStaff, pool: Pool) -> Response:
    """Stop offering the app: signs out its device and stops patient prompts. The staff timer keeps running."""
    endpoint = "visits.exclusion"
    fp = submissions.fingerprint(body, visit=visit_id)
    async with write_tx(pool, staff.actor) as conn:
        _, exclusion = await _visit_at_site(conn, visit_id, staff.site_id, lock=True)
        if await submissions.find(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp) is None:
            if exclusion is not None:
                raise _conflict("an app exclusion cannot be removed or changed")
            await conn.execute(
                "UPDATE visit SET app_exclusion = %s WHERE id = %s", [body.app_exclusion.value, visit_id]
            )
            await events.notify(conn, DashboardEventType.VISIT_CHANGED, visit_id)
            await submissions.record(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp,
                                     visit_id=visit_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/visits/{visit_id}/open-checkin",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["staff actions (demo)"],
    responses={
        403: {"description": "Demo check-ins are turned off (RECHECK_DEMO_CHECKINS)"},
        404: {"description": "No such visit at this site"},
        409: {"description": "The visit is closed or doesn't offer the app"},
    },
)
async def open_checkin(visit_id: UUID, body: OpenCheckin, staff: DeskStaff, pool: Pool) -> Response:
    """Demo only: open the patient's next check-in now. The due time only moves earlier; the staff timer stays."""
    if not demo_checkins_enabled():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "opening a check-in early is a demo setting that is turned off")
    endpoint = "visits.open_checkin"
    fp = submissions.fingerprint(body, visit=visit_id)
    async with write_tx(pool, staff.actor) as conn:
        visit_status, exclusion = await _visit_at_site(conn, visit_id, staff.site_id, lock=True)
        if await submissions.find(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp) is None:
            if visit_status != "waiting" or exclusion is not None:
                raise _conflict("only a waiting visit that offers the app has check-ins")
            await conn.execute(
                "UPDATE visit SET next_prompt_due_at = least(next_prompt_due_at, now()) WHERE id = %s", [visit_id]
            )
            await events.notify(conn, DashboardEventType.VISIT_CHANGED, visit_id)
            await submissions.record(conn, body.submission_id, actor=staff.actor, endpoint=endpoint, fp=fp,
                                     visit_id=visit_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
