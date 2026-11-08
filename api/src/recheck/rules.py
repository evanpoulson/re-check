"""Demo escalation rules: which review tasks a report raises.

Deterministic and side-effect free. The same rules generate the synthetic
cohort (`synthetic/cohort.py`) and the web app's mock server, so seeded and
live tasks look alike. Levels, reason codes and deadlines are DEMO VALUES for
clinical review, not clinical guidance.

Escalate-only: rules only ever add reasons. Nothing here can lower a level,
close a task or cancel a concern; a reassuring answer simply fires nothing.
"""

from dataclasses import dataclass
from datetime import timedelta

from .attention import AttentionResult
from .contract.codes import ConcernCode, FeelingChange, FindingCode, PatientMessage, StaffRole, TaskLevel
from .contract.reports import CheckinReport, ConcernReport, FindingReport, LeavingReport

RULESET_VERSION = "2026-11-07.demo"

# How long staff have to acknowledge, by level (synthetic/calibration.py ACK_MINUTES).
ACK_DUE = {
    TaskLevel.RED: timedelta(minutes=2),
    TaskLevel.AMBER: timedelta(minutes=10),
    TaskLevel.SILENT: timedelta(minutes=10),
    TaskLevel.LEAVE_RISK: timedelta(minutes=10),
    TaskLevel.OVERDUE: timedelta(minutes=10),
}

LEVEL_ORDER = [TaskLevel.OVERDUE, TaskLevel.LEAVE_RISK, TaskLevel.SILENT, TaskLevel.AMBER, TaskLevel.RED]


@dataclass(frozen=True)
class Fire:
    """One rule firing: becomes a task_reason on the visit's single open task."""

    level: TaskLevel
    reason_code: str
    routed_to: tuple[StaffRole, ...] = (StaffRole.PHYSICIAN,)

    @property
    def rule_id(self) -> str:
        # Same format as the synthetic cohort, and a valid contract Code (lowercase, digits, underscores).
        return f"demo_{self.reason_code}_v1"


Report = CheckinReport | ConcernReport | FindingReport | LeavingReport


def findings_of(report: Report) -> list[FindingCode]:
    if isinstance(report, FindingReport):
        return list(report.findings)
    if isinstance(report, CheckinReport) and report.new_findings.kind == "answered":
        return list(report.new_findings.value)
    return []


def evaluate(report: Report, attention: AttentionResult | None = None) -> list[Fire]:
    """Every rule the report triggers. `attention` is the scored circle check, if a prompt was shown."""
    fires = [Fire(TaskLevel.RED, f"finding_{code.value}") for code in findings_of(report)]

    if isinstance(report, CheckinReport) and report.feeling_change.kind == "answered":
        if report.feeling_change.value is FeelingChange.MUCH_WORSE:
            fires.append(Fire(TaskLevel.RED, "feeling_worse"))
        elif report.feeling_change.value is FeelingChange.WORSE:
            fires.append(Fire(TaskLevel.AMBER, "feeling_worse"))

    if isinstance(report, ConcernReport):
        if report.concern is ConcernCode.DESK_QUESTION:
            # Non-clinical: the triage nurse answers it.
            fires.append(Fire(TaskLevel.OVERDUE, "concern_desk_question", (StaffRole.TRIAGE_NURSE,)))
        elif report.concern is ConcernCode.HELP_NOW:
            fires.append(Fire(TaskLevel.RED, "concern_help_now"))
        else:
            fires.append(Fire(TaskLevel.AMBER, "concern_worried"))

    if isinstance(report, LeavingReport):
        fires.append(Fire(TaskLevel.LEAVE_RISK, "leaving"))

    # A wrong or unanswered count only asks staff to check in person. No prompt shown means no check.
    if attention is AttentionResult.INCORRECT:
        fires.append(Fire(TaskLevel.OVERDUE, "attention_incorrect"))
    elif attention is AttentionResult.MISSING:
        fires.append(Fire(TaskLevel.OVERDUE, "attention_unanswered"))

    return fires


def patient_message(report: Report, fires: list[Fire]) -> PatientMessage:
    """What the patient screen says after this report.

    A task's level (red, amber, ...) only sets its colour and rank on the staff
    dashboard; nothing pages or notifies a clinician. So the patient is never
    told "a clinician has been told" (`clinician_told` is never sent). Any
    clinical task gets "a clinician will check on you".
    """
    if isinstance(report, LeavingReport):
        return PatientMessage.LEAVING_INFO
    if {f.level for f in fires} & {TaskLevel.RED, TaskLevel.AMBER, TaskLevel.SILENT, TaskLevel.LEAVE_RISK}:
        return PatientMessage.CLINICIAN_WILL_CHECK
    return PatientMessage.NONE


def highest(levels) -> TaskLevel:
    return max(levels, key=LEVEL_ORDER.index)
