from datetime import UTC, datetime
from uuid import uuid4

from hypothesis import given
from hypothesis import strategies as st

from recheck import rules
from recheck.attention import AttentionResult
from recheck.contract.codes import ConcernCode, FeelingChange, FeelingNow, FindingCode, PatientMessage, StaffRole, TaskLevel
from recheck.contract.reports import CheckinReport, ConcernReport, FindingReport, LeavingReport
from recheck.question_bank import default_bank

NOW = datetime(2026, 11, 7, 20, 0, tzinfo=UTC)
BASE = {"reporter": "patient", "channel": "phone", "captured_at": NOW}
MISSING = {"kind": "missing", "reason": "unsure"}


def checkin(change=None, findings=None, now=None) -> CheckinReport:
    return CheckinReport.model_validate({
        **BASE,
        "submission_id": uuid4(),
        "kind": "checkin",
        "questionnaire_version": default_bank().version,
        "feeling_now": {"kind": "answered", "value": now} if now else MISSING,
        "feeling_change": {"kind": "answered", "value": change} if change else MISSING,
        "pain": MISSING,
        "new_findings": {"kind": "answered", "value": findings} if findings is not None else MISSING,
        "attention": {"kind": "missing", "reason": "not_asked"},
    })


checkins = st.builds(
    checkin,
    change=st.none() | st.sampled_from(list(FeelingChange)),
    findings=st.none() | st.lists(st.sampled_from(list(FindingCode)), unique=True, max_size=4),
    now=st.none() | st.sampled_from(list(FeelingNow)),
)
attention = st.none() | st.sampled_from(list(AttentionResult))


@given(checkins, attention)
def test_reassuring_answers_never_fire(report, att):
    """same/better/no findings can't open or raise anything clinical (escalate-only)."""
    reassuring = report.feeling_change.kind == "missing" or report.feeling_change.value in (
        FeelingChange.SAME, FeelingChange.BETTER, FeelingChange.MUCH_BETTER
    )
    if reassuring and not rules.findings_of(report):
        assert {f.level for f in rules.evaluate(report, att)} <= {TaskLevel.OVERDUE}


@given(checkins, attention)
def test_every_finding_is_red_and_tells_the_patient(report, att):
    fires = rules.evaluate(report, att)
    for code in rules.findings_of(report):
        assert rules.Fire(TaskLevel.RED, f"finding_{code.value}") in fires
    if rules.findings_of(report):
        assert rules.patient_message(report, fires) is PatientMessage.CLINICIAN_TOLD


@given(checkins, attention)
def test_rules_are_deterministic_and_well_formed(report, att):
    fires = rules.evaluate(report, att)
    assert fires == rules.evaluate(report, att)
    for f in fires:
        assert f.rule_id.startswith("demo-") and f.rule_id.endswith("-v1")
        assert f.level in rules.ACK_DUE
        assert f.routed_to


@given(checkins, attention)
def test_attention_check_only_asks_for_an_in_person_look(report, att):
    with_att = rules.evaluate(report, att)
    without = rules.evaluate(report, None)
    extra = [f for f in with_att if f not in without]
    assert all(f.level is TaskLevel.OVERDUE for f in extra)
    assert rules.patient_message(report, with_att) is rules.patient_message(report, without)


def test_worse_is_amber_much_worse_is_red():
    assert rules.evaluate(checkin(change="worse")) == [rules.Fire(TaskLevel.AMBER, "feeling_worse")]
    assert rules.evaluate(checkin(change="much_worse")) == [rules.Fire(TaskLevel.RED, "feeling_worse")]


def test_concerns():
    def concern(code):
        return ConcernReport.model_validate({**BASE, "submission_id": uuid4(), "kind": "concern", "concern": code})

    assert rules.evaluate(concern(ConcernCode.HELP_NOW)) == [rules.Fire(TaskLevel.RED, "concern_help_now")]
    assert rules.evaluate(concern(ConcernCode.WORRIED)) == [rules.Fire(TaskLevel.AMBER, "concern_worried")]
    desk = rules.evaluate(concern(ConcernCode.DESK_QUESTION))
    assert desk == [rules.Fire(TaskLevel.OVERDUE, "concern_desk_question", (StaffRole.TRIAGE_NURSE,))]
    assert rules.patient_message(concern(ConcernCode.DESK_QUESTION), desk) is PatientMessage.NONE


def test_finding_and_leaving_reports():
    finding = FindingReport.model_validate(
        {**BASE, "submission_id": uuid4(), "kind": "finding", "findings": ["speech_change"]}
    )
    assert rules.evaluate(finding) == [rules.Fire(TaskLevel.RED, "finding_speech_change")]
    leaving = LeavingReport.model_validate({**BASE, "submission_id": uuid4(), "kind": "leaving"})
    fires = rules.evaluate(leaving)
    assert fires == [rules.Fire(TaskLevel.LEAVE_RISK, "leaving")]
    assert rules.patient_message(leaving, fires) is PatientMessage.LEAVING_INFO


def test_ruleset_matches_the_synthetic_cohort():
    from recheck.synthetic import calibration, cohort

    assert rules.RULESET_VERSION == cohort.RULE_VERSION
    assert {k.value: v.total_seconds() / 60 for k, v in rules.ACK_DUE.items()} == calibration.ACK_MINUTES


@given(st.lists(st.sampled_from(list(TaskLevel)), min_size=1))
def test_highest_is_the_max_in_ranking_order(levels):
    top = rules.highest(levels)
    assert all(rules.LEVEL_ORDER.index(top) >= rules.LEVEL_ORDER.index(level) for level in levels)
