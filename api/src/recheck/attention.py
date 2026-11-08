"""Circle-counting reliability check.

The server picks a sequence of circles and squares for each patient check-in,
stores it, and scores the patient's count. Our own design, inspired by the
DelApp counting task; it is not validated for self-use. A wrong or missing count
only asks staff to check the patient in person. It is not a clinical test.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from .contract.answers import AttentionAnswered, AttentionMissing
from .contract.patient import AttentionStep
from .question_bank import AttentionParams

MIN_JUMP = 0.25
"""Minimum distance between consecutive shapes, so two shapes in one spot aren't read as one."""

MARGIN = 0.1
"""Keep shapes away from the edges of the play area."""


@dataclass(frozen=True)
class AttentionSequence:
    steps: list[AttentionStep]
    expected_count: int


class AttentionResult(StrEnum):
    CORRECT = "correct"
    INCORRECT = "incorrect"
    MISSING = "missing"


def _position(rng: random.Random, previous: tuple[float, float] | None) -> tuple[float, float]:
    while True:
        point = (rng.uniform(MARGIN, 1 - MARGIN), rng.uniform(MARGIN, 1 - MARGIN))
        if previous is None or math.dist(point, previous) >= MIN_JUMP:
            return round(point[0], 3), round(point[1], 3)


def generate(rng: random.Random, params: AttentionParams) -> AttentionSequence:
    """A shuffled sequence of circles (to count) and squares (to ignore)."""
    circles = rng.randint(params.circles_min, params.circles_max)
    squares = rng.randint(params.squares_min, params.squares_max)
    shapes = ["circle"] * circles + ["square"] * squares
    rng.shuffle(shapes)
    steps: list[AttentionStep] = []
    previous = None
    for shape in shapes:
        x, y = _position(rng, previous)
        steps.append(AttentionStep(shape=shape, x=x, y=y))
        previous = (x, y)
    return AttentionSequence(steps=steps, expected_count=circles)


class PromptMismatch(ValueError):
    """The answer names a different prompt from the one being scored."""


def score(prompt_id: UUID, expected_count: int, answer: AttentionAnswered | AttentionMissing) -> AttentionResult:
    """Score an answer against the prompt the server issued.

    The caller must also check the prompt belongs to the visit, is unexpired and
    hasn't been answered before. A missing answer that names no prompt (such as
    a companion check-in) is not a missed check: the patient was never shown one.
    """
    if answer.prompt_id is not None and answer.prompt_id != prompt_id:
        raise PromptMismatch(f"answer is for prompt {answer.prompt_id}, not {prompt_id}")
    if isinstance(answer, AttentionMissing):
        return AttentionResult.MISSING
    return AttentionResult.CORRECT if answer.count == expected_count else AttentionResult.INCORRECT
