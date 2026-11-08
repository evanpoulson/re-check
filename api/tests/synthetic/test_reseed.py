from datetime import UTC, datetime, timedelta

import pytest

from recheck import settings, views
from recheck.synthetic.reseed import MEANT_SILENT, demo_cohort

ANCHOR = datetime(2026, 11, 8, 20, 0, tzinfo=UTC)


def cohort():
    return demo_cohort(ANCHOR, "test-reseed", quiet_from=60, quiet_to=180, ack_minutes=15)


def test_small_board_all_waiting():
    c = cohort()
    assert 5 <= len(c.visits) <= 10
    assert all(v.status == "waiting" for v in c.visits)
    assert {"chest_worsening", "companion_speech_live", "head_injury_unanswered"} <= {v.scenario for v in c.visits}


def test_only_the_meant_silent_visits_are_overdue():
    for v in cohort().visits:
        due = v.next_prompt_due_at
        if v.scenario in MEANT_SILENT:
            assert due is not None and due < ANCHOR
        else:
            assert due is None or due >= ANCHOR + timedelta(minutes=60)
            assert v.staff_reassess_due_at >= ANCHOR + timedelta(minutes=60)


def test_open_tasks_have_time_to_acknowledge():
    for v in cohort().visits:
        t = v.open_task
        if t is not None and t.acknowledged_at is None:
            assert t.ack_due_at >= ANCHOR + timedelta(minutes=15)
            assert not t.escalated


def test_demo_pace_stretches_deadlines(monkeypatch):
    monkeypatch.setenv("RECHECK_DEMO_PACE", "4")
    assert views.silent_after() == timedelta(minutes=20)
    monkeypatch.setenv("RECHECK_DEMO_PACE", "0.5")
    with pytest.raises(ValueError):
        settings.demo_pace()
    monkeypatch.delenv("RECHECK_DEMO_PACE")
    assert views.silent_after() == views.SILENT_AFTER
