"""Fixed code lists.

Each becomes a string union in the generated TypeScript types. Patient-facing
text lives in the translated question bank, keyed by these codes.
"""

from enum import StrEnum


class Language(StrEnum):
    """The patient's language: English, French and the 13 most common other
    mother tongues in Canada (2021 Census, Statistics Canada table 98-10-0175).

    Codes are ISO 639 so staff can book the right interpreter. Mandarin and
    Cantonese are separate spoken languages; Mandarin text uses simplified
    characters and Cantonese text uses traditional characters. Keep in step with
    the CHECK on visit.language in db/schema.sql.
    """

    EN = "en"
    FR = "fr"
    ZH = "zh"  # Mandarin
    PA = "pa"  # Punjabi (Gurmukhi script)
    YUE = "yue"  # Cantonese
    ES = "es"
    AR = "ar"
    TL = "tl"
    IT = "it"
    DE = "de"
    PT = "pt"
    UR = "ur"
    RU = "ru"
    FA = "fa"  # Persian
    VI = "vi"


class ComplaintGroup(StrEnum):
    """Pathway selected from the triage CEDIS complaint (question-bank/cedis-groups.json)."""

    CHEST_BACK_PAIN = "chest_back_pain"
    NEURO_CHANGE = "neuro_change"
    HEAD_INJURY = "head_injury"
    CONFUSED_DROWSY = "confused_drowsy"
    GENERAL = "general"


class AppExclusion(StrEnum):
    """Why the patient app was not offered. Staff watch these patients directly."""

    CHILD = "child"
    PREGNANCY_OVER_20_WEEKS = "pregnancy_over_20_weeks"
    SELF_HARM_OR_VIOLENCE = "self_harm_or_violence"
    MAJOR_TRAUMA = "major_trauma"


class SessionEndReason(StrEnum):
    """Why a signed-in device was signed out. Sessions have no timer."""

    TAKEOVER = "takeover"
    SIGNED_OUT = "signed_out"
    STAFF_SIGNED_OUT = "staff_signed_out"
    VISIT_CLOSED = "visit_closed"
    APP_EXCLUDED = "app_excluded"


class VisitStatus(StrEnum):
    WAITING = "waiting"
    ROOMED = "roomed"
    LEFT = "left"
    DISCHARGED = "discharged"


class Channel(StrEnum):
    """The device a report came through."""

    PHONE = "phone"
    PAGER = "pager"
    DESK = "desk"


class Reporter(StrEnum):
    """Who answered. Independent of the channel."""

    PATIENT = "patient"
    COMPANION = "companion"
    STAFF = "staff"


class StaffRole(StrEnum):
    TRIAGE_NURSE = "triage_nurse"
    PHYSICIAN = "physician"
    CHARGE_NURSE = "charge_nurse"
    QUALITY = "quality"


class FeelingNow(StrEnum):
    """Wellness question 1, adapted from the Patient Wellness Questionnaire (Martha's Rule).

    "Not sure" is a missing reason.
    """

    VERY_GOOD = "very_good"
    GOOD = "good"
    OK = "ok"
    POOR = "poor"
    VERY_POOR = "very_poor"


class FeelingChange(StrEnum):
    """Wellness question 2: compared with when staff last checked. "Not sure" is a missing reason."""

    MUCH_BETTER = "much_better"
    BETTER = "better"
    SAME = "same"
    WORSE = "worse"
    MUCH_WORSE = "much_worse"


class MissingReason(StrEnum):
    """Why a question has no answer. Never treat any of these as a negative."""

    UNSURE = "unsure"
    UNABLE_TO_RESPOND = "unable_to_respond"
    NOT_ASKED = "not_asked"
    NOT_REACHED = "not_reached"


class FindingCode(StrEnum):
    """New warning signs a patient or companion can report (FR5, FR11, brief section 4)."""

    CHEST_PAIN = "chest_pain"
    TROUBLE_BREATHING = "trouble_breathing"
    NEW_CONFUSION = "new_confusion"
    FAINTING = "fainting"
    NEW_WEAKNESS_NUMBNESS = "new_weakness_numbness"
    HEAVY_BLEEDING = "heavy_bleeding"
    VOMITING = "vomiting"
    WORST_HEADACHE = "worst_headache"
    SPEECH_CHANGE = "speech_change"
    FACIAL_DROOP = "facial_droop"
    DROWSINESS = "drowsiness"
    VISION_CHANGE = "vision_change"
    BALANCE_CHANGE = "balance_change"


class ConcernCode(StrEnum):
    """Always-visible buttons. `desk_question` is non-clinical and goes to the triage nurse only."""

    WORRIED = "worried"
    HELP_NOW = "help_now"
    DESK_QUESTION = "desk_question"


class ReportKind(StrEnum):
    CHECKIN = "checkin"
    CONCERN = "concern"
    FINDING = "finding"
    LEAVING = "leaving"
    STAFF_FLAG = "staff_flag"


class TaskLevel(StrEnum):
    """Escalation level, lowest first. A task's level can only go up.

    The order matches the physician list ranking in FR13, reversed.
    """

    OVERDUE = "overdue"
    LEAVE_RISK = "leave_risk"
    SILENT = "silent"
    AMBER = "amber"
    RED = "red"

    @property
    def rank(self) -> int:
        return list(TaskLevel).index(self)


class TaskStatus(StrEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    COMPLETED = "completed"


class TaskEventType(StrEnum):
    CREATED = "created"
    REASON_ADDED = "reason_added"
    LEVEL_RAISED = "level_raised"
    ESCALATED = "escalated"
    DELIVERED = "delivered"
    ACKNOWLEDGED = "acknowledged"
    ASSESSED = "assessed"


class Disposition(StrEnum):
    """Outcome recorded when a task is completed (FR16, brief section 4)."""

    ASSESSED_STABLE = "assessed_stable"
    TESTS_ORDERED = "tests_ordered"
    RE_TRIAGED = "re_triaged"
    ROOMED = "roomed"
    TREATED_AND_RELEASED = "treated_and_released"
    LEFT_BEFORE_ASSESSMENT = "left_before_assessment"
    NOT_LOCATED = "not_located"


class PatientMessage(StrEnum):
    """What the patient screen shows after a report (FR9, FR10, escalation table)."""

    NONE = "none"
    CLINICIAN_WILL_CHECK = "clinician_will_check"
    CLINICIAN_TOLD = "clinician_told"
    LEAVING_INFO = "leaving_info"


class ItemInputType(StrEnum):
    YES_NO = "yes_no"
    CHOICE = "choice"
    MULTI_CHOICE = "multi_choice"
    SCALE = "scale"


class WaitSource(StrEnum):
    AHS_FEED = "ahs_feed"
    SITE_ESTIMATE = "site_estimate"


class DashboardEventType(StrEnum):
    REPORT_RECEIVED = "report.received"
    VITALS_RECORDED = "vitals.recorded"
    TASK_CHANGED = "task.changed"
    VISIT_CHANGED = "visit.changed"
