import math
import random
from uuid import uuid4

import pytest
from hypothesis import given
from hypothesis import strategies as st

from recheck.attention import MIN_JUMP, AttentionResult, PromptMismatch, generate, score
from recheck.contract.answers import AttentionAnswered, AttentionMissing
from recheck.contract.codes import MissingReason
from recheck.question_bank import default_bank

PARAMS = default_bank().attention_params()


@given(st.integers(min_value=0, max_value=2**32))
def test_sequence_matches_bank_settings(seed):
    seq = generate(random.Random(seed), PARAMS)
    circles = sum(s.shape == "circle" for s in seq.steps)
    squares = sum(s.shape == "square" for s in seq.steps)
    assert seq.expected_count == circles
    assert PARAMS.circles_min <= circles <= PARAMS.circles_max
    assert PARAMS.squares_min <= squares <= PARAMS.squares_max
    for a, b in zip(seq.steps, seq.steps[1:]):
        assert math.dist((a.x, a.y), (b.x, b.y)) >= MIN_JUMP - 0.002  # positions are rounded to 3 places


def test_same_seed_gives_same_sequence():
    assert generate(random.Random(7), PARAMS) == generate(random.Random(7), PARAMS)


def test_scoring():
    prompt = uuid4()
    assert score(prompt, 5, AttentionAnswered(kind="answered", prompt_id=prompt, count=5)) is AttentionResult.CORRECT
    assert score(prompt, 5, AttentionAnswered(kind="answered", prompt_id=prompt, count=4)) is AttentionResult.INCORRECT
    missing = AttentionMissing(kind="missing", reason=MissingReason.UNABLE_TO_RESPOND, prompt_id=prompt)
    assert score(prompt, 5, missing) is AttentionResult.MISSING


def test_scoring_rejects_another_prompt():
    with pytest.raises(PromptMismatch):
        score(uuid4(), 5, AttentionAnswered(kind="answered", prompt_id=uuid4(), count=5))
