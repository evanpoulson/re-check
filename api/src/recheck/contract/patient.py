"""What the patient or companion screen loads.

Nothing here carries staff-only fields such as task level or reasons.
"""

from typing import Literal

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


class PatientHome(OutputModel):
    """Every screen shows the wait range and "Your answers never change your place in line." (FR8)."""

    role: Literal[Reporter.PATIENT, Reporter.COMPANION]
    language: Language
    wait_range: WaitRange | None
    next_checkin_due_at: Timestamp | None
    questionnaire_version: Version
    items: list[QuestionItem]
    message: PatientMessage
