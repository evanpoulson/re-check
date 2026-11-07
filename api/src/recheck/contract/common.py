"""Base classes and shared field types for the API contract."""

from collections.abc import Sequence
from typing import Annotated, TypeVar
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints

T = TypeVar("T")


class InputModel(BaseModel):
    """A body a client sends.

    Unknown fields are rejected. Each nested model inherits this, so the rule
    applies all the way down.
    """

    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)


class OutputModel(BaseModel):
    """A body the server returns."""

    model_config = ConfigDict(frozen=True)


def _unique(values: Sequence[T]) -> Sequence[T]:
    if len(set(values)) != len(values):
        raise ValueError("items must be unique")
    return values


def unique_list(item: type[T], *, min_length: int = 0):
    """A list type that rejects duplicates and says so in the JSON Schema."""
    return Annotated[
        list[item],
        Field(min_length=min_length, json_schema_extra={"uniqueItems": True}),
        AfterValidator(_unique),
    ]


SubmissionId = Annotated[
    UUID,
    Field(
        description=(
            "Client-generated UUID. Create it before the first attempt and resend it unchanged "
            "on every retry, including after an offline queue syncs. The server uses it to drop "
            "duplicates and rejects a reused ID that arrives with different content."
        )
    ),
]

Timestamp = AwareDatetime
"""Timezone-aware timestamp. Naive datetimes are rejected."""

Ctas = Annotated[
    int,
    Field(
        strict=True,
        ge=2,
        le=5,
        description="Initial CTAS level. CTAS 1 is never in the waiting room, so it is rejected.",
    ),
]

Pain = Annotated[int, Field(strict=True, ge=0, le=10, description="Self-reported pain, 0 to 10.")]

Code = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
"""Stable snake_case key, such as a question item key or an option code."""

Version = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9._-]{0,63}$")]
"""Version label for a question bank or ruleset release, such as `2026-11-07.1`."""
