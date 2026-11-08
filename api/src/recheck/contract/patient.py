"""What the patient or companion screen loads.

Nothing here carries staff-only fields such as task level or reasons.
"""

from typing import Literal
from uuid import UUID

from pydantic import Field

from .codes import ItemInputType, Language, PatientMessage, Reporter, WaitSource
from .common import Code, OutputModel, Timestamp, Version


class WaitRange(OutputModel):
    low_minutes: int = Field(ge=0)
    high_minutes: int = Field(ge=0)
    source: WaitSource
    as_of: Timestamp


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
    """Every screen shows the wait range and "Your answers never change your place in line." (FR8)."""

    role: Literal[Reporter.PATIENT, Reporter.COMPANION]
    language: Language
    wait_range: WaitRange | None
    next_checkin_due_at: Timestamp | None
    questionnaire_version: Version
    items: list[QuestionItem]
    attention_prompt: AttentionPrompt | None = Field(
        default=None, description="Present for the patient role on a due check-in; never for a companion."
    )
    message: PatientMessage
