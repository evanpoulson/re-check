"""Staff dashboards: physician worklist, triage board, charge nurse view,
handover and the quality page.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field

from .codes import ComplaintGroup, FeelingChange, FeelingNow, Reporter, Channel, TaskLevel
from .common import Ctas, OutputModel, Timestamp
from .reports import PatientReport
from .staff import FlagRecord, VitalsRecord
from .tasks import Task, TaskEvent
from .visits import VisitSummary


class ReportRecord(OutputModel):
    type: Literal["report"] = "report"
    report_id: UUID = Field(description="Equal to the report's submission ID.")
    visit_id: UUID
    received_at: Timestamp
    report: PatientReport


TimelineEntry = Annotated[ReportRecord | VitalsRecord | FlagRecord | TaskEvent, Field(discriminator="type")]


class TrendPoint(OutputModel):
    """One check-in on the sparkline. Null means the question had no answer."""

    at: Timestamp
    pain: int | None
    feeling_now: FeelingNow | None
    feeling_change: FeelingChange | None


class LastReport(OutputModel):
    at: Timestamp
    kind: Literal["checkin", "concern", "finding", "leaving"]
    reporter: Reporter
    channel: Channel


class WorklistRow(OutputModel):
    """One row of the physician's "see next" list (FR14)."""

    rank: int = Field(ge=1)
    visit: VisitSummary
    open_task: Task | None
    silent: bool
    leave_risk: bool
    prompt_overdue: bool
    reassess_overdue: bool
    last_report: LastReport | None
    trend: list[TrendPoint]


class Worklist(OutputModel):
    """Ranked red, amber, silent, leave risk, overdue, then by wait time (FR13)."""

    generated_at: Timestamp
    rows: list[WorklistRow]


class VisitDetail(OutputModel):
    """Full timeline for one patient (FR15), oldest first."""

    visit: VisitSummary
    open_task: Task | None
    timeline: list[TimelineEntry]


class BoardRow(OutputModel):
    """Triage nurse's silent board (FR17)."""

    visit_id: UUID
    ctas: Ctas
    complaint_group: ComplaintGroup
    triaged_at: Timestamp
    level: TaskLevel | None
    staff_reassess_due_at: Timestamp | None
    reassess_overdue: bool


class TriageBoard(OutputModel):
    generated_at: Timestamp
    rows: list[BoardRow]


class ChargeNurseView(OutputModel):
    """Escalated tasks, nurse flags and everything routed outside TLP hours (FR18)."""

    generated_at: Timestamp
    tlp_on_duty: bool
    tasks: list[Task]


class Handover(OutputModel):
    """Shift handover built from a fixed template, no AI (FR19)."""

    generated_at: Timestamp
    shift_start: Timestamp
    shift_end: Timestamp
    patients: list[WorklistRow]
    open_tasks: list[Task]
    reassess_overdue: list[UUID]


class HourBucket(OutputModel):
    hour: Timestamp
    tasks_created: int = Field(ge=0)
    audible_alerts: int = Field(ge=0)
    patients_waiting: int = Field(ge=0)


class ShiftCount(OutputModel):
    shift_start: Timestamp
    unacknowledged: int = Field(ge=0)


class CtasCount(OutputModel):
    ctas: Ctas
    count: int = Field(ge=0)


class QualitySummary(OutputModel):
    """Aggregates only. Individual logs are for incident review (FR20)."""

    window_start: Timestamp
    window_end: Timestamp
    hourly: list[HourBucket]
    median_seconds_to_ack: float | None
    median_seconds_to_assess: float | None
    unacknowledged_by_shift: list[ShiftCount]
    walkouts_by_ctas: list[CtasCount]
