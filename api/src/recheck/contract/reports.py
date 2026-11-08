"""Reports from patients and companions.

Phone, pager and the simulator all send these same bodies (one observation
model). The visit comes from the session, never from the body.
"""

from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from .answers import (
    AttentionAnswer,
    FeelingChangeAnswer,
    FeelingNowAnswer,
    FindingsAnswer,
    ItemAnswer,
    Missing,
    PainAnswer,
)
from .codes import Channel, ConcernCode, FindingCode, MissingReason, PatientMessage, Reporter
from .common import Code, InputModel, OutputModel, SubmissionId, Timestamp, Version, unique_list


class _ReportBase(InputModel):
    submission_id: SubmissionId
    reporter: Literal[Reporter.PATIENT, Reporter.COMPANION] = Field(
        description=(
            "For phone reports, must equal the role chosen at sign-in; the server rejects a mismatch "
            "and the database checks it against the session. A signed-out device can't report, "
            "including reports it queued offline before it was signed out."
        )
    )
    channel: Literal[Channel.PHONE, Channel.PAGER]
    captured_at: Timestamp = Field(
        description="When the person answered on the device. The server records its own received time."
    )


class CheckinReport(_ReportBase):
    """A scheduled check-in (FR5, FR6), or follow-up answers after an urgent report.

    A scheduled check-in may be partial: unreached questions are `not_reached`.
    Urgent findings are routed as soon as this is received, even if partial.
    """

    kind: Literal["checkin"]
    purpose: Literal["scheduled", "followup"] = Field(
        default="scheduled",
        description=(
            "`scheduled` is accepted only once the patient prompt is due and restarts the prompt timer. "
            "`followup` answers only question bank items (every fixed question `not_asked`), is accepted "
            "at any time and never moves a timer."
        ),
    )
    questionnaire_version: Version
    feeling_now: FeelingNowAnswer
    feeling_change: FeelingChangeAnswer
    pain: PainAnswer
    new_findings: FindingsAnswer
    attention: AttentionAnswer = Field(
        description="Circle-counting reliability check. Patient only; a companion sends it as missing."
    )
    items: dict[Code, ItemAnswer] = Field(
        default_factory=dict, description="Complaint-specific answers keyed by question bank item key."
    )

    @model_validator(mode="after")
    def _companion_cannot_answer_for_patient(self) -> Self:
        if self.reporter is Reporter.COMPANION:
            if not isinstance(self.pain, Missing):
                raise ValueError("pain is self-reported; a companion must send it as missing")
            if self.attention.kind != "missing" or self.attention.prompt_id is not None:
                raise ValueError(
                    "the attention check is done by the patient; a companion sends it as missing with no prompt"
                )
        return self

    @model_validator(mode="after")
    def _followup_answers_items_only(self) -> Self:
        # A follow-up can be sent before the check-in is due, so it must not carry a check-in's answers.
        if self.purpose == "followup":
            fixed = (self.feeling_now, self.feeling_change, self.pain, self.new_findings, self.attention)
            if any(a.kind != "missing" or a.reason is not MissingReason.NOT_ASKED for a in fixed):
                raise ValueError("a follow-up sends every fixed question as missing: not_asked")
            if self.attention.prompt_id is not None:
                raise ValueError("a follow-up never names an attention prompt")
        return self


class ConcernReport(_ReportBase):
    """"I'm worried", "I need help now" or "Question about my wait or care", available at any time."""

    kind: Literal["concern"]
    concern: ConcernCode


class FindingReport(_ReportBase):
    """A new warning sign reported outside a scheduled check-in."""

    kind: Literal["finding"]
    findings: unique_list(FindingCode, min_length=1)


class LeavingReport(_ReportBase):
    """"I'm leaving" (FR9)."""

    kind: Literal["leaving"]


PatientReport = Annotated[
    CheckinReport | ConcernReport | FindingReport | LeavingReport,
    Field(discriminator="kind"),
]


class ReportReceipt(OutputModel):
    """Returned for every report, including a duplicate retry."""

    submission_id: SubmissionId
    received_at: Timestamp
    duplicate: bool = Field(description="True if this submission ID was already received with the same content.")
    patient_message: PatientMessage
    follow_up_items: list[Code] = Field(
        default_factory=list,
        description="Question bank items to ask next, chosen after any urgent routing has happened.",
    )
