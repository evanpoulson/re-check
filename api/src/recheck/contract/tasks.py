"""Review tasks: what the rules engine and timers produce.

One open task per visit. New reasons are added to it, and its level only goes
up. Routing, delivery, acknowledgement and assessment are separate steps.
"""

from typing import Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from .codes import Disposition, StaffRole, TaskEventType, TaskLevel, TaskStatus
from .common import Code, OutputModel, Timestamp, Version
from .staff import StaffRef


class EvidenceRef(OutputModel):
    kind: Literal["report", "vitals", "flag"]
    id: UUID


class TaskReason(OutputModel):
    """Why a rule fired, pinned to the ruleset version it ran under."""

    rule_id: Code
    rule_version: Version
    level: TaskLevel
    reason_code: Code
    evidence: list[EvidenceRef]
    fired_at: Timestamp


class Task(OutputModel):
    task_id: UUID
    visit_id: UUID
    level: TaskLevel
    status: TaskStatus
    escalated: bool = Field(description="True once routed to the charge nurse as backup.")
    routed_to: list[StaffRole]
    reasons: list[TaskReason] = Field(min_length=1)
    created_at: Timestamp
    ack_due_at: Timestamp | None
    delivered_at: Timestamp | None = Field(description="First shown on a staff dashboard.")
    acknowledged_at: Timestamp | None
    acknowledged_by: StaffRef | None
    assessed_at: Timestamp | None
    assessed_by: StaffRef | None
    disposition: Disposition | None

    @model_validator(mode="after")
    def _status_matches_steps(self) -> Self:
        acked = self.acknowledged_at is not None and self.acknowledged_by is not None
        assessed = self.assessed_at is not None and self.assessed_by is not None and self.disposition is not None
        partial_ack = (self.acknowledged_at is None) != (self.acknowledged_by is None)
        partial_assess = len({self.assessed_at is None, self.assessed_by is None, self.disposition is None}) > 1
        if partial_ack or partial_assess:
            raise ValueError("acknowledgement and assessment fields must be set together")
        expected = {
            TaskStatus.OPEN: (False, False),
            TaskStatus.ACKNOWLEDGED: (True, False),
            TaskStatus.COMPLETED: (True, True),
        }[self.status]
        if (acked, assessed) != expected:
            raise ValueError(f"status {self.status} does not match acknowledgement and assessment fields")
        return self


class TaskEvent(OutputModel):
    type: Literal["task_event"] = "task_event"
    task_id: UUID
    event: TaskEventType
    at: Timestamp
    level: TaskLevel
    by: StaffRef | None = Field(description="Staff member for acknowledge and assess; null for system events.")
