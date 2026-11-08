from __future__ import annotations

import os
import re
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from pydantic import TypeAdapter

from recheck.contract.answers import ItemAnswer
from recheck.question_bank import default_bank
from recheck.synthetic import calibration as cal
from recheck.synthetic.cohort import COHORT_SIZE, INTERVAL_MINUTES, build_cohort, calibrate

ANCHOR = datetime(2026, 11, 8, 3, 30, tzinfo=UTC)  # 20:30 in Calgary
BANK = default_bank()
ITEM = TypeAdapter(ItemAnswer)


@pytest.fixture(scope="module")
def cohort():
    return build_cohort(ANCHOR)


def by_scenario(cohort, name):
    return next(v for v in cohort.visits if v.scenario == name)


def check_invariants(c) -> None:
    assert len(c.visits) == COHORT_SIZE
    assert len({v.id for v in c.visits}) == COHORT_SIZE
    for v in c.visits:
        interval = timedelta(minutes=INTERVAL_MINUTES[v.ctas])
        assert 2 <= v.ctas <= 5
        assert v.complaint_group == BANK.complaint_group(v.cedis_code).value
        if v.cedis_code in BANK.exclusion_by_cedis:
            assert v.app_exclusion == BANK.exclusion_by_cedis[v.cedis_code].value
        assert (v.status == "waiting") == (v.closed_at is None)
        assert v.closed_at is None or v.closed_at <= c.anchor
        if v.app_exclusion:
            assert not v.reports and not v.sessions and v.channel is None
        # Only staff move the staff timer.
        assert v.staff_reassess_due_at == (v.last_staff_check_at or v.triaged_at) + interval

        assert sum(1 for s in v.sessions if s.revoked_at is None) <= 1
        sessions = {s.id: s for s in v.sessions}
        for r in v.reports:
            assert v.triaged_at <= r.captured_at <= c.anchor
            assert v.closed_at is None or r.captured_at <= v.closed_at
            if r.session_id is not None:
                s = sessions[r.session_id]
                assert s.role == r.reporter and r.channel == "phone"
                assert s.created_at <= r.captured_at and (s.revoked_at is None or r.captured_at <= s.revoked_at)
            if r.kind != "checkin":
                assert r.items == {}
                continue
            assert r.questionnaire_version == BANK.version
            for value, missing in [
                (r.feeling_now, r.feeling_now_missing),
                (r.feeling_change, r.feeling_change_missing),
                (r.pain, r.pain_missing),
                (r.findings, r.findings_missing),
                (r.attention_count, r.attention_missing),
            ]:
                assert (value is None) != (missing is None)
            if r.reporter == "companion":
                assert r.pain is None and r.attention_count is None and r.attention_prompt_id is None
            if r.attention_count is not None:
                assert r.attention_prompt_id in {p.id for p in v.prompts}
            for key, answer in r.items.items():
                assert key in BANK.items
                ITEM.validate_python(answer)

        assert sum(1 for t in v.tasks if t.status != "completed") <= 1
        for t in v.tasks:
            assert t.reasons and t.routed_to
            assert t.ack_due_at <= t.created_at + timedelta(minutes=cal.ACK_MINUTES[t.reasons[0].level])
            assert max(cal_order(r.level) for r in t.reasons) == cal_order(t.level)
            if t.status == "completed":
                assert t.acknowledged_at and t.assessed_at and t.disposition
                assert t.created_at <= t.acknowledged_at <= t.assessed_at <= c.anchor
            elif t.status == "acknowledged":
                assert t.acknowledged_at and not t.assessed_at


def cal_order(level: str) -> int:
    return ["overdue", "leave_risk", "silent", "amber", "red"].index(level)


def test_invariants(cohort):
    check_invariants(cohort)


@settings(max_examples=15, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    seed=st.integers(0, 10_000),
    minutes=st.integers(0, 7 * 24 * 60),
)
def test_invariants_hold_for_any_seed_and_load_time(seed, minutes):
    check_invariants(build_cohort(ANCHOR + timedelta(minutes=minutes), seed=seed, batch=f"t-{seed}"))


def test_codes_match_the_contract(cohort):
    """rule_id, reason_code and scenario names are contract codes: lowercase letters, digits, underscores."""
    code = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
    for v in cohort.visits:
        assert code.match(v.scenario), v.scenario
        for t in v.tasks:
            for r in t.reasons:
                assert code.match(r.rule_id) and code.match(r.reason_code), r.rule_id


def test_deterministic(cohort):
    again = build_cohort(ANCHOR)
    assert again.to_json() == cohort.to_json()
    other_batch = build_cohort(ANCHOR, batch="demo-2")
    assert {v.id for v in other_batch.visits}.isdisjoint({v.id for v in cohort.visits})


def test_leavers_match_calibrated_rate(cohort):
    expected = sum(v.profile["leave_probability"] for v in cohort.visits)
    assert expected / COHORT_SIZE == pytest.approx(cal.LEAVE_RATE_TARGET, abs=1e-3)
    assert sum(v.status == "left" for v in cohort.visits) == round(expected)


def test_calibrate_hits_target():
    probs = calibrate([0.5, 1.0, 2.0, 4.0], 0.07)
    assert sum(probs) / 4 == pytest.approx(0.07, abs=1e-4)
    assert probs == sorted(probs)


def test_demo_cases(cohort):
    chest = by_scenario(cohort, "chest_worsening")
    assert chest.open_task.level == "red" and chest.open_task.status == "open"
    assert [r.pain for r in chest.reports] == [6, 7, 9]

    head = by_scenario(cohort, "head_injury_unanswered")
    assert not head.reports
    assert head.open_task.level == "silent"
    assert head.next_prompt_due_at < cohort.anchor and head.staff_reassess_due_at < cohort.anchor

    live = by_scenario(cohort, "companion_speech_live")
    assert live.status == "waiting" and live.open_task is None
    assert [s.role for s in live.sessions] == ["companion"]

    done = by_scenario(cohort, "companion_speech_done")
    assert done.status == "roomed"
    (task,) = done.tasks
    assert task.level == "red" and task.disposition == "roomed" and task.reasons[0].reason_code == "finding_speech_change"
    assert all(r.reporter == "companion" for r in done.reports)

    leaving = by_scenario(cohort, "leave_intent")
    assert leaving.open_task.level == "leave_risk" and leaving.reports[-1].kind == "leaving"

    takeover = by_scenario(cohort, "confused_takeover")
    first, second = takeover.sessions
    assert first.revoked_reason == "takeover" and second.replaces == first.id and second.role == "companion"

    desk = by_scenario(cohort, "desk_question")
    assert desk.tasks[0].routed_to == ["triage_nurse"] and desk.tasks[0].status == "completed"

    for name in ("excluded_self_harm", "excluded_pregnancy", "excluded_trauma"):
        assert by_scenario(cohort, name).app_exclusion


@pytest.mark.skipif(not os.environ.get("RECHECK_TEST_DATABASE_URL"), reason="set RECHECK_TEST_DATABASE_URL to a scratch database")
def test_loads_into_database():
    import psycopg

    from recheck.synthetic.load import load

    url = os.environ["RECHECK_TEST_DATABASE_URL"]
    c = build_cohort(datetime.now(UTC), batch=f"test-{uuid.uuid4()}")
    tokens = load(c, url)
    assert len(tokens) == sum(v.app_exclusion is None for v in c.visits)
    with psycopg.connect(url) as conn:
        ids = [v.id for v in c.visits]
        (visits,) = conn.execute("SELECT count(*) FROM visit WHERE id = ANY(%s)", (ids,)).fetchone()
        (reports,) = conn.execute("SELECT count(*) FROM report WHERE visit_id = ANY(%s)", (ids,)).fetchone()
        (open_tasks,) = conn.execute(
            "SELECT count(*) FROM task WHERE visit_id = ANY(%s) AND status <> 'completed'", (ids,)
        ).fetchone()
    assert visits == COHORT_SIZE
    assert reports == sum(len(v.reports) for v in c.visits)
    assert open_tasks == sum(v.open_task is not None for v in c.visits)
    with pytest.raises(SystemExit):
        load(c, url)
