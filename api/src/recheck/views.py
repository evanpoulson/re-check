"""Read models for the staff screens: rebuild contract objects from database rows.

Behaviour matches the web app's mock server (web/src/api/mocks/store.ts):
worklist rows, ranking, triage board and the visit timeline. Everything is
scoped to the staff member's site.
"""

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection
from pydantic import TypeAdapter

from .contract.codes import TaskEventType
from .contract.reports import PatientReport
from .contract.staff import FlagRecord, StaffRef, VitalsRecord
from .contract.tasks import Task, TaskEvent, TaskReason
from .contract.views import BoardRow, LastReport, ReportRecord, SessionRecord, TrendPoint, WorklistRow
from .contract.visits import VisitSummary
from .rules import LEVEL_ORDER

# A prompt this long overdue counts as silent (synthetic/calibration.py SILENT_AFTER_MINUTES, web mock).
SILENT_AFTER = timedelta(minutes=5)

_report_adapter = TypeAdapter(PatientReport)


def staff_ref(actor: str | None, role: str | None) -> StaffRef | None:
    return StaffRef(user_id=actor, role=role) if actor and role else None


# ---------------------------------------------------------------------------
# Visits
# ---------------------------------------------------------------------------

VISIT_COLUMNS = """
    v.id, v.site_id, v.ctas, v.complaint_group::text, v.cedis_code, v.language, v.app_exclusion::text,
    v.channel::text, v.pager_no, v.status::text, v.triaged_at, v.closed_at, v.next_prompt_due_at,
    v.staff_reassess_due_at, v.last_staff_check_at, s.role::text, s.created_at
"""
VISIT_FROM = "visit v LEFT JOIN visit_session s ON s.visit_id = v.id AND s.revoked_at IS NULL"


def visit_summary(row) -> VisitSummary:
    (vid, site, ctas, group, cedis, lang, exclusion, channel, pager, status, triaged, closed,
     prompt_due, reassess_due, last_check, signed_role, signed_since) = row
    return VisitSummary(
        visit_id=vid, site_id=site, ctas=ctas, complaint_group=group, cedis_code=cedis, language=lang,
        app_exclusion=exclusion, channel=channel, pager_no=pager, status=status, triaged_at=triaged,
        closed_at=closed, next_prompt_due_at=prompt_due, staff_reassess_due_at=reassess_due,
        last_staff_check_at=last_check, signed_in_as=signed_role, signed_in_since=signed_since,
    )


async def waiting_visits(conn: AsyncConnection, site_id: str) -> list[VisitSummary]:
    cur = await conn.execute(
        f"SELECT {VISIT_COLUMNS} FROM {VISIT_FROM} WHERE v.site_id = %s AND v.status = 'waiting'", [site_id]
    )
    return [visit_summary(r) for r in await cur.fetchall()]


async def one_visit(conn: AsyncConnection, site_id: str, visit_id: UUID) -> VisitSummary | None:
    cur = await conn.execute(f"SELECT {VISIT_COLUMNS} FROM {VISIT_FROM} WHERE v.site_id = %s AND v.id = %s",
                             [site_id, visit_id])
    row = await cur.fetchone()
    return visit_summary(row) if row else None


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

TASK_COLUMNS = """
    t.id, t.visit_id, t.level::text, t.status::text, t.escalated, t.routed_to::text[], t.created_at,
    t.ack_due_at, t.delivered_at, t.acknowledged_at, t.acknowledged_by, t.acknowledged_by_role::text,
    t.assessed_at, t.assessed_by, t.assessed_by_role::text, t.disposition::text
"""


async def tasks_for(conn: AsyncConnection, visit_ids: list[UUID], *, open_only: bool) -> list[Task]:
    """Tasks with their reasons, oldest first."""
    if not visit_ids:
        return []
    cur = await conn.execute(
        f"SELECT {TASK_COLUMNS} FROM task t WHERE t.visit_id = ANY(%s)"
        + (" AND t.status <> 'completed'" if open_only else "")
        + " ORDER BY t.created_at",
        [visit_ids],
    )
    rows = await cur.fetchall()
    if not rows:
        return []
    cur = await conn.execute(
        "SELECT task_id, rule_id, rule_version, level::text, reason_code, evidence, fired_at FROM task_reason"
        " WHERE task_id = ANY(%s) ORDER BY fired_at, id",
        [[r[0] for r in rows]],
    )
    reasons: dict[UUID, list[TaskReason]] = defaultdict(list)
    for task_id, rule_id, version, level, code, evidence, fired_at in await cur.fetchall():
        reasons[task_id].append(TaskReason(
            rule_id=rule_id, rule_version=version, level=level, reason_code=code, evidence=evidence, fired_at=fired_at
        ))
    return [
        Task(
            task_id=r[0], visit_id=r[1], level=r[2], status=r[3], escalated=r[4], routed_to=r[5], reasons=reasons[r[0]],
            created_at=r[6], ack_due_at=r[7], delivered_at=r[8], acknowledged_at=r[9],
            acknowledged_by=staff_ref(r[10], r[11]), assessed_at=r[12], assessed_by=staff_ref(r[13], r[14]),
            disposition=r[15],
        )
        for r in rows
    ]


def task_events(task: Task) -> list[TaskEvent]:
    """Timeline events derived from a task and its reasons.

    Escalation has no stored timestamp yet, so it shows only on the task itself.
    """
    events: list[TaskEvent] = []
    top = None
    for i, reason in enumerate(task.reasons):
        if i == 0:
            kind = TaskEventType.CREATED
        elif LEVEL_ORDER.index(reason.level) > LEVEL_ORDER.index(top):
            kind = TaskEventType.LEVEL_RAISED
        else:
            kind = TaskEventType.REASON_ADDED
        top = reason.level if top is None or LEVEL_ORDER.index(reason.level) > LEVEL_ORDER.index(top) else top
        events.append(TaskEvent(task_id=task.task_id, event=kind, at=reason.fired_at, level=top, by=None))
    for kind, at, by in (
        (TaskEventType.DELIVERED, task.delivered_at, None),
        (TaskEventType.ACKNOWLEDGED, task.acknowledged_at, task.acknowledged_by),
        (TaskEventType.ASSESSED, task.assessed_at, task.assessed_by),
    ):
        if at is not None:
            events.append(TaskEvent(task_id=task.task_id, event=kind, at=at, level=task.level, by=by))
    return events


def rank_key(level) -> int:
    return LEVEL_ORDER.index(level) if level is not None else -1


# ---------------------------------------------------------------------------
# Reports, vitals, flags, sessions
# ---------------------------------------------------------------------------

REPORT_COLUMNS = """
    id, visit_id, received_at, captured_at, kind::text, reporter::text, channel::text, questionnaire_version,
    feeling_now::text, feeling_now_missing::text, feeling_change::text, feeling_change_missing::text,
    pain, pain_missing::text, findings::text[], findings_missing::text,
    attention_prompt_id, attention_count, attention_missing::text, items, concern::text, note, entered_by
"""


def _answer(value: Any, missing: str | None) -> dict:
    return {"kind": "missing", "reason": missing} if missing else {"kind": "answered", "value": value}


def report_body(row: dict) -> dict:
    """The PatientReport body as the device sent it, rebuilt from the stored columns."""
    body = {
        "submission_id": row["id"], "kind": row["kind"], "reporter": row["reporter"], "channel": row["channel"],
        "captured_at": row["captured_at"],
    }
    if row["kind"] == "checkin":
        if row["attention_count"] is not None:
            attention = {"kind": "answered", "prompt_id": row["attention_prompt_id"], "count": row["attention_count"]}
        else:
            attention = {"kind": "missing", "reason": row["attention_missing"], "prompt_id": row["attention_prompt_id"]}
        body |= {
            "questionnaire_version": row["questionnaire_version"],
            "feeling_now": _answer(row["feeling_now"], row["feeling_now_missing"]),
            "feeling_change": _answer(row["feeling_change"], row["feeling_change_missing"]),
            "pain": _answer(row["pain"], row["pain_missing"]),
            "new_findings": _answer(row["findings"], row["findings_missing"]),
            "attention": attention,
            "items": row["items"] or {},
        }
    elif row["kind"] == "finding":
        body["findings"] = row["findings"]
    elif row["kind"] == "concern":
        body["concern"] = row["concern"]
    return body


async def reports_for(conn: AsyncConnection, visit_ids: list[UUID]) -> list[dict]:
    """All reports for the visits, oldest first, as dicts of column values."""
    if not visit_ids:
        return []
    cur = await conn.execute(
        f"SELECT {REPORT_COLUMNS} FROM report WHERE visit_id = ANY(%s) ORDER BY received_at", [visit_ids]
    )
    names = [c.name for c in cur.description]
    return [dict(zip(names, r)) for r in await cur.fetchall()]


def report_record(row: dict) -> ReportRecord:
    return ReportRecord(
        report_id=row["id"], visit_id=row["visit_id"], received_at=row["received_at"],
        report=_report_adapter.validate_python(report_body(row)),
    )


def flag_record(row: dict) -> FlagRecord:
    return FlagRecord(
        flag_id=row["id"], visit_id=row["visit_id"], received_at=row["received_at"],
        flagged_by=StaffRef(user_id=row["entered_by"], role="triage_nurse"), note=row["note"],
    )


def trend(rows: list[dict]) -> list[TrendPoint]:
    return [
        TrendPoint(at=r["received_at"], pain=r["pain"], feeling_now=r["feeling_now"], feeling_change=r["feeling_change"])
        for r in rows
        if r["kind"] == "checkin"
    ]


def last_report(rows: list[dict]) -> LastReport | None:
    patient_rows = [r for r in rows if r["kind"] != "staff_flag"]
    if not patient_rows:
        return None
    r = patient_rows[-1]
    return LastReport(at=r["received_at"], kind=r["kind"], reporter=r["reporter"], channel=r["channel"])


async def vitals_records(conn: AsyncConnection, visit_id: UUID) -> list[VitalsRecord]:
    cur = await conn.execute(
        "SELECT id, visit_id, measured_at, received_at, entered_by, entered_by_role::text, sbp, dbp, hr, rr, spo2,"
        " temp_c, supersedes FROM vitals WHERE visit_id = %s ORDER BY received_at",
        [visit_id],
    )
    return [
        VitalsRecord(
            vitals_id=r[0], visit_id=r[1], measured_at=r[2], received_at=r[3],
            entered_by=StaffRef(user_id=r[4], role=r[5]), sbp=r[6], dbp=r[7], hr=r[8], rr=r[9], spo2=r[10],
            temp_c=float(r[11]) if r[11] is not None else None, supersedes=r[12],
        )
        for r in await cur.fetchall()
    ]


async def session_records(conn: AsyncConnection, visit_id: UUID) -> list[SessionRecord]:
    cur = await conn.execute(
        "SELECT id, visit_id, role::text, created_at, revoked_at, revoked_reason::text, replaces FROM visit_session"
        " WHERE visit_id = %s ORDER BY created_at",
        [visit_id],
    )
    return [
        SessionRecord(session_id=r[0], visit_id=r[1], role=r[2], started_at=r[3], ended_at=r[4], end_reason=r[5],
                      replaces=r[6])
        for r in await cur.fetchall()
    ]


# ---------------------------------------------------------------------------
# Screens
# ---------------------------------------------------------------------------


def worklist_rows(visits: list[VisitSummary], tasks: list[Task], reports: list[dict], now: datetime) -> list[WorklistRow]:
    """Ranked by open task level (red first), then longest wait."""
    task_by_visit = {t.visit_id: t for t in tasks}
    reports_by_visit: dict[UUID, list[dict]] = defaultdict(list)
    for r in reports:
        reports_by_visit[r["visit_id"]].append(r)

    unranked = []
    for v in visits:
        rows = reports_by_visit[v.visit_id]
        last = last_report(rows)
        due = v.next_prompt_due_at
        unranked.append(dict(
            visit=v,
            open_task=task_by_visit.get(v.visit_id),
            silent=due is not None and now - due >= SILENT_AFTER,
            leave_risk=last is not None and last.kind == "leaving",
            prompt_overdue=due is not None and now > due,
            reassess_overdue=v.staff_reassess_due_at is not None and now > v.staff_reassess_due_at,
            last_report=last,
            trend=trend(rows),
        ))
    unranked.sort(key=lambda r: (
        -rank_key(r["open_task"].level if r["open_task"] else None),
        r["visit"].triaged_at,
    ))
    return [WorklistRow(rank=i + 1, **r) for i, r in enumerate(unranked)]


def board_rows(visits: list[VisitSummary], tasks: list[Task], now: datetime) -> list[BoardRow]:
    task_by_visit = {t.visit_id: t for t in tasks}
    return [
        BoardRow(
            visit_id=v.visit_id, ctas=v.ctas, complaint_group=v.complaint_group, triaged_at=v.triaged_at,
            level=task_by_visit[v.visit_id].level if v.visit_id in task_by_visit else None,
            staff_reassess_due_at=v.staff_reassess_due_at,
            reassess_overdue=v.staff_reassess_due_at is not None and now > v.staff_reassess_due_at,
        )
        for v in sorted(visits, key=lambda v: v.triaged_at)
    ]
