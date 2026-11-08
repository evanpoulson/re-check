"""What the patient or companion screen loads.

Nothing here carries staff-only fields such as task level or reasons.
"""

from typing import Literal
from uuid import UUID

from pydantic import Field

from .codes import ItemInputType, Language, PatientMessage, Reporter, WaitSource
from .common import Code, Ctas, OutputModel, Timestamp, Version


class WaitEstimate(OutputModel):
    """The department's current wait estimate for new arrivals, as the source publishes it.

    For AHS this is one facility-wide figure: triage to first physician for a
    mid-acuity patient arriving now. It is not this patient's remaining wait.
    """

    minutes: int = Field(ge=0)
    source: WaitSource
    as_of: Timestamp = Field(description="When Recheck fetched the value. The AHS feed carries no timestamp.")


class QuestionOption(OutputModel):
    code: Code
    text: str


class QuestionItem(OutputModel):
    """One fixed question from the question bank, in the session's language."""

    key: Code
    input_type: ItemInputType
    text: str
    options: list[QuestionOption] = Field(default_factory=list)
    allow_unsure: bool = Field(default=True, description='Show a "Not sure" button, sent as missing: unsure.')


class AttentionStep(OutputModel):
    """One shape shown during the circle-counting check. Positions are fractions of the play area."""

    shape: Literal["circle", "square"]
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class AttentionPrompt(OutputModel):
    """Circle-counting reliability check, generated and stored by the server for one check-in.

    The patient counts the circles and ignores the squares. Shapes are distinguished
    by outline, not colour alone. Not a clinical test: a wrong or missing count only
    asks staff to check the patient in person.
    """

    prompt_id: UUID
    steps: list[AttentionStep] = Field(min_length=1)
    show_ms: int = Field(ge=200, description="How long each shape stays on screen.")
    gap_ms: int = Field(ge=0, description="Blank time between shapes.")
    expires_at: Timestamp


class PatientHome(OutputModel):
    """Every screen shows the wait estimate, the time waited and "Your answers never change your place in line." (FR8)."""

    role: Literal[Reporter.PATIENT, Reporter.COMPANION]
    language: Language
    wait_estimate: WaitEstimate | None = Field(
        description='Null when no fresh estimate exists; the screen shows "Estimate unavailable".'
    )
    waited_minutes: int = Field(ge=0, description="Whole minutes since triage, computed by the server on each fetch.")
    next_checkin_due_at: Timestamp | None
    checkin_open: bool = Field(
        description=(
            "True once the next check-in is due, by the server's clock. Until then the screen shows when it "
            "opens instead of a start button; the always-visible buttons and reporting a change stay available."
        )
    )
    questionnaire_version: Version
    items: list[QuestionItem]
    attention_prompt: AttentionPrompt | None = Field(
        default=None, description="Present for the patient role while a check-in is open; never for a companion."
    )
    message: PatientMessage
    triage_level: Ctas | None = Field(
        default=None,
        description=(
            "The level set at triage, sent only when the site shows it (SiteSettings.show_triage_level). "
            "The screen explains it in plain words and never shows a target time."
        ),
    )
