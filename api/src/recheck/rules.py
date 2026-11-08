"""Demo escalation rules: which review tasks a report raises.

Deterministic and side-effect free. The same rules generate the synthetic
cohort (`synthetic/cohort.py`) and the web app's mock server, so seeded and
live tasks look alike. Levels, reason codes and deadlines are DEMO VALUES for
clinical review, not clinical guidance.

Escalate-only: rules only ever add reasons. Nothing here can lower a level,
close a task or cancel a concern; a reassuring answer simply fires nothing.

Not every answer weighs the same. Self-report tools over-call (UK eTriage
overtriaged 59% against nurse triage), so a single broad answer asks for a
review rather than raising an urgent task:

- A sign that is specific, observable and time critical is urgent on its own.
- Other signs are common in a waiting room. One alone asks for a review; two
  together, or one with "much worse", are urgent.
- A sign the triage nurse already recorded (chest pain in a chest pain visit) is
  not new. It asks for a review unless something corroborates it.
- "Much worse" with "very poor" right now is urgent; the two answers agree at
  the extreme. "Much worse" otherwise asks for a review. "Worse" asks for one
  only if the person did not also say they feel OK or better right now.

See docs/research/patient-view-evidence.md. All tiers are demo values for
clinical sign-off.
"""

from dataclasses import dataclass
from datetime import timedelta

from .attention import AttentionResult
from .contract.codes import (
    ComplaintGroup,
    ConcernCode,
    FeelingChange,
    FeelingNow,
    FindingCode,
    PatientMessage,
    StaffRole,
    TaskLevel,
)
from .contract.reports import CheckinReport, ConcernReport, FindingReport, LeavingReport

RULESET_VERSION = "2026-11-08.demo"

# How long staff have to acknowledge, by level (synthetic/calibration.py ACK_MINUTES).
ACK_DUE = {
    TaskLevel.RED: timedelta(minutes=2),
    TaskLevel.AMBER: timedelta(minutes=10),
    TaskLevel.SILENT: timedelta(minutes=10),
    TaskLevel.LEAVE_RISK: timedelta(minutes=10),
    TaskLevel.OVERDUE: timedelta(minutes=10),
}

# Urgent on their own. Keep in step with web/src/lib/findings.ts.
URGENT_FINDINGS = frozenset({
    FindingCode.SPEECH_CHANGE,
    FindingCode.FACIAL_DROOP,
    FindingCode.NEW_WEAKNESS_NUMBNESS,
    FindingCode.TROUBLE_BREATHING,
    FindingCode.FAINTING,
    FindingCode.HEAVY_BLEEDING,
    FindingCode.NEW_CONFUSION,
    FindingCode.CHEST_PAIN,
})

# Signs the triage complaint already covers. Reported again, they ask for a review.
KNOWN_AT_TRIAGE: dict[ComplaintGroup, frozenset[FindingCode]] = {
    ComplaintGroup.CHEST_BACK_PAIN: frozenset({FindingCode.CHEST_PAIN}),
    ComplaintGroup.CONFUSED_DROWSY: frozenset({FindingCode.NEW_CONFUSION, FindingCode.DROWSINESS}),
}

# "Right now" answers that make "worse than before" a mild change.
FEELING_OK = frozenset({FeelingNow.OK, FeelingNow.GOOD, FeelingNow.VERY_GOOD})

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


def is_urgent(code: FindingCode, complaint_group: ComplaintGroup | None = None) -> bool:
    """Urgent on its own, and not something triage already recorded for this visit."""
    return code in URGENT_FINDINGS and code not in KNOWN_AT_TRIAGE.get(complaint_group, frozenset())


def weigh(
    findings: list[FindingCode],
    feeling_now: FeelingNow | None,
    feeling_change: FeelingChange | None,
    complaint_group: ComplaintGroup | None = None,
) -> list[Fire]:
    """What warning signs and the two wellness answers raise. `None` means not answered."""
    much_worse = feeling_change is FeelingChange.MUCH_WORSE
    urgent = [code for code in findings if is_urgent(code, complaint_group)]
    review = [code for code in findings if code not in urgent]
    corroborated = len(review) >= 2 or (len(review) == 1 and much_worse)
    fires = [Fire(TaskLevel.RED, f"finding_{code.value}") for code in urgent]
    fires += [Fire(TaskLevel.RED if corroborated else TaskLevel.AMBER, f"finding_{code.value}") for code in review]

    if much_worse:
        fires.append(Fire(TaskLevel.RED if feeling_now is FeelingNow.VERY_POOR else TaskLevel.AMBER, "feeling_worse"))
    elif feeling_change is FeelingChange.WORSE and feeling_now not in FEELING_OK:
        fires.append(Fire(TaskLevel.AMBER, "feeling_worse"))
    return fires


def evaluate(
    report: Report, attention: AttentionResult | None = None, complaint_group: ComplaintGroup | None = None
) -> list[Fire]:
    """Every rule the report triggers.

    `attention` is the scored circle check, if a prompt was shown. `complaint_group`
    is the visit's triage pathway, so a sign triage already knows about isn't news.
    """
    now = change = None
    if isinstance(report, CheckinReport):
        now = report.feeling_now.value if report.feeling_now.kind == "answered" else None
        change = report.feeling_change.value if report.feeling_change.kind == "answered" else None
    fires = weigh(findings_of(report), now, change, complaint_group)

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


STAFF_FLAG = Fire(TaskLevel.AMBER, "staff_flag")
"""Triage nurse's one-tap "flag higher" (FR17): opens or raises an amber task for the physician."""


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
