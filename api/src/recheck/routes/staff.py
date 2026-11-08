"""Staff screens (read side): physician worklist, triage board, visit timeline."""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from .. import views
from ..auth import Pool, Staff, require_staff
from ..contract.codes import StaffRole
from ..contract.views import TriageBoard, VisitDetail, Worklist

router = APIRouter(prefix="/api", tags=["staff screens"])

CLINICAL = (StaffRole.TRIAGE_NURSE, StaffRole.PHYSICIAN, StaffRole.CHARGE_NURSE)
WorklistStaff = Annotated[Staff, Depends(require_staff(StaffRole.PHYSICIAN, StaffRole.CHARGE_NURSE))]
BoardStaff = Annotated[Staff, Depends(require_staff(StaffRole.TRIAGE_NURSE, StaffRole.CHARGE_NURSE))]
ClinicalStaff = Annotated[Staff, Depends(require_staff(*CLINICAL))]


@router.get("/worklist", response_model=Worklist)
async def worklist(staff: WorklistStaff, pool: Pool) -> Worklist:
    """Physician's "see next" list: red, amber, silent, leave risk, overdue, then longest wait (FR13, FR14)."""
    async with pool.connection() as conn:
        visits = await views.waiting_visits(conn, staff.site_id)
        ids = [v.visit_id for v in visits]
        tasks = await views.tasks_for(conn, ids, open_only=True)
        reports = await views.reports_for(conn, ids)
    now = datetime.now(UTC)
    return Worklist(generated_at=now, rows=views.worklist_rows(visits, tasks, reports, now))


@router.get("/triage-board", response_model=TriageBoard)
async def triage_board(staff: BoardStaff, pool: Pool) -> TriageBoard:
    """Triage nurse's quiet board: who is waiting, task colour, and staff reassessments due (FR17)."""
    async with pool.connection() as conn:
        visits = await views.waiting_visits(conn, staff.site_id)
        tasks = await views.tasks_for(conn, [v.visit_id for v in visits], open_only=True)
    now = datetime.now(UTC)
    return TriageBoard(generated_at=now, rows=views.board_rows(visits, tasks, now))


@router.get("/visits/{visit_id}", response_model=VisitDetail, responses={404: {"description": "No such visit at this site"}})
async def visit_detail(visit_id: UUID, staff: ClinicalStaff, pool: Pool) -> VisitDetail:
    """Everything that happened on one visit, oldest first (FR15)."""
    async with pool.connection() as conn:
        visit = await views.one_visit(conn, staff.site_id, visit_id)
        if visit is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "visit not found")
        tasks = await views.tasks_for(conn, [visit_id], open_only=False)
        reports = await views.reports_for(conn, [visit_id])
        vitals = await views.vitals_records(conn, visit_id)
        sessions = await views.session_records(conn, visit_id)

    timeline = [
        views.flag_record(r) if r["kind"] == "staff_flag" else views.report_record(r) for r in reports
    ]
    timeline += vitals + sessions + [e for t in tasks for e in views.task_events(t)]

    def stamp(entry):
        return getattr(entry, "received_at", None) or getattr(entry, "started_at", None) or entry.at

    timeline.sort(key=stamp)
    open_task = next((t for t in tasks if t.status != "completed"), None)
    return VisitDetail(visit=visit, open_task=open_task, timeline=timeline)
