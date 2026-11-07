"""Answer values.

Every answer is either a value or an explicit missing reason, so "no", "not
sure", "couldn't answer" and "never asked" can't be confused.
"""

from typing import Annotated, Literal

from pydantic import Field, StrictBool

from .codes import FindingCode, MissingReason, Overall
from .common import Code, InputModel, Pain, unique_list


class Missing(InputModel):
    kind: Literal["missing"]
    reason: MissingReason


class OverallAnswered(InputModel):
    kind: Literal["answered"]
    value: Overall


class PainAnswered(InputModel):
    kind: Literal["answered"]
    value: Pain


class FindingsAnswered(InputModel):
    """An empty list means the person said none of these apply."""

    kind: Literal["answered"]
    value: unique_list(FindingCode)


OverallAnswer = Annotated[OverallAnswered | Missing, Field(discriminator="kind")]
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
