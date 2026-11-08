"""Answer values.

Every answer is either a value or an explicit missing reason, so "no", "not
sure", "couldn't answer" and "never asked" can't be confused.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StrictBool

from .codes import FeelingChange, FeelingNow, FindingCode, MissingReason
from .common import Code, InputModel, Pain, unique_list


class Missing(InputModel):
    kind: Literal["missing"]
    reason: MissingReason


class FeelingNowAnswered(InputModel):
    kind: Literal["answered"]
    value: FeelingNow


class FeelingChangeAnswered(InputModel):
    kind: Literal["answered"]
    value: FeelingChange


class AttentionAnswered(InputModel):
    """The patient's count for a circle-counting prompt. The server scores it against what it issued."""

    kind: Literal["answered"]
    prompt_id: UUID = Field(description="The attention prompt the server issued for this check-in.")
    count: int = Field(strict=True, ge=0, le=20)


class PainAnswered(InputModel):
    kind: Literal["answered"]
    value: Pain


class FindingsAnswered(InputModel):
    """An empty list means the person said none of these apply."""

    kind: Literal["answered"]
    value: unique_list(FindingCode)


FeelingNowAnswer = Annotated[FeelingNowAnswered | Missing, Field(discriminator="kind")]
FeelingChangeAnswer = Annotated[FeelingChangeAnswered | Missing, Field(discriminator="kind")]
class AttentionMissing(InputModel):
    """No count. Carries the prompt ID when one was shown, so staff can tell "shown but not answered"
    from "never shown" (a companion check-in, for example)."""

    kind: Literal["missing"]
    reason: MissingReason
    prompt_id: UUID | None = None


AttentionAnswer = Annotated[AttentionAnswered | AttentionMissing, Field(discriminator="kind")]
PainAnswer = Annotated[PainAnswered | Missing, Field(discriminator="kind")]
FindingsAnswer = Annotated[FindingsAnswered | Missing, Field(discriminator="kind")]


# Complaint-specific question bank items (FR6). Item keys and option codes come
# from the versioned question bank; the server checks them against that version.


class YesNoAnswered(InputModel):
    kind: Literal["yes_no"]
    value: StrictBool


class ChoiceAnswered(InputModel):
    kind: Literal["choice"]
    value: Code


class MultiChoiceAnswered(InputModel):
    kind: Literal["multi_choice"]
    value: unique_list(Code)


class ScaleAnswered(InputModel):
    kind: Literal["scale"]
    value: Pain


ItemAnswer = Annotated[
    YesNoAnswered | ChoiceAnswered | MultiChoiceAnswered | ScaleAnswered | Missing,
    Field(discriminator="kind"),
]
