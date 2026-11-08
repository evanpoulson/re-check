import copy
import json
import re
from pathlib import Path

import pytest

from recheck.contract.codes import (
    AppExclusion,
    ComplaintGroup,
    ConcernCode,
    FeelingChange,
    FeelingNow,
    FindingCode,
    Reporter,
)
from recheck.contract.answers import Missing, YesNoAnswered
from recheck.contract.visits import VisitCreate
from recheck.question_bank import (
    BANK_DIR,
    BankError,
    EnrolmentConflict,
    QuestionBank,
    check_enrolment,
    default_bank,
    ext_value,
    ext_values,
    load_bank,
    option_codes,
    raw_answers,
)

BASE_FIELDS = {"reporter", "feeling_now", "feeling_change", "pain", "new_findings", "attention"}


@pytest.fixture(scope="module")
def bank() -> QuestionBank:
    return default_bank()


def write_bank(tmp_path: Path, questionnaire: dict, concept_map: dict) -> Path:
    (tmp_path / "questionnaire.json").write_text(json.dumps(questionnaire))
    (tmp_path / "cedis-groups.json").write_text(json.dumps(concept_map))
    return tmp_path


def raw(name: str) -> dict:
    return json.loads((BANK_DIR / name).read_text())


# --- the bank matches the contract ----------------------------------------


def test_bank_loads_and_versions_match(bank):
    assert re.match(r"^\d{4}-\d{2}-\d{2}\.\d+$", bank.version)


def test_option_codes_match_contract_code_lists(bank):
    assert option_codes(bank.items["feeling_now"]) == [c.value for c in FeelingNow]
    assert option_codes(bank.items["feeling_change"]) == [c.value for c in FeelingChange]
    assert set(option_codes(bank.items["new_findings"])) == {c.value for c in FindingCode}
    assert set(option_codes(bank.items["complaint_group"])) == {c.value for c in ComplaintGroup}
    assert set(option_codes(bank.items["answerer"])) == {Reporter.PATIENT.value, Reporter.COMPANION.value}


def test_buttons_cover_every_concern(bank):
    concerns = {ext_value(bank.items[k], "concern-code") for k in bank.section("always_visible")} - {None}
    assert concerns == {c.value for c in ConcernCode}


def test_base_items_map_to_contract_fields(bank):
    fields = {ext_value(bank.items[k], "contract-field") for k in bank.section("base")}
    assert fields == BASE_FIELDS


def test_follow_ups_go_in_items_under_their_own_key(bank):
    for key in bank.section("follow_up"):
        assert ext_value(bank.items[key], "contract-field") == f"items.{key}"


def test_patient_only_items(bank):
    for key in ("pain", "circle_count"):
        assert ext_values(bank.items[key], "reporter") == ["patient"]
    assert bank.base_items(Reporter.PATIENT) == [
        "answerer", "feeling_now", "feeling_change", "pain", "new_findings", "circle_count",
    ]
    assert bank.base_items(Reporter.COMPANION) == ["answerer", "feeling_now", "feeling_change", "new_findings"]


def test_unknown_is_not_sure_everywhere(bank):
    for key in bank.section("base") + bank.section("follow_up"):
        assert not {"dont_know", "not_sure", "unknown"} & set(option_codes(bank.items[key])), key


def test_every_question_and_button_has_companion_wording(bank):
    for key in bank.section("always_visible") + bank.section("base") + bank.section("follow_up"):
        if ext_values(bank.items[key], "reporter") == ["patient"] or key == "answerer":
            continue
        assert ext_value(bank.items[key], "companion-text"), key


def test_every_question_cites_evidence_listed_in_sources(bank):
    sources = (BANK_DIR / "SOURCES.md").read_text()
    for key in bank.section("base") + bank.section("follow_up"):
        if key == "answerer":
            continue
        evidence = ext_values(bank.items[key], "evidence")
        assert evidence, f"{key} has no evidence"
        for ref in evidence:
            assert f"`{ref}`" in sources, f"{key}: evidence {ref!r} is missing from SOURCES.md"


def test_translations_are_marked_pending(bank):
    assert set(ext_values(bank.questionnaire, "translation-pending")) == {"pa", "tl"}


# --- CEDIS mapping ---------------------------------------------------------


@pytest.mark.parametrize(
    ("cedis", "group"),
    [
        ("003", ComplaintGroup.CHEST_BACK_PAIN),
        ("551", ComplaintGroup.CHEST_BACK_PAIN),
        ("403", ComplaintGroup.NEURO_CHANGE),
        ("404", ComplaintGroup.NEURO_CHANGE),
        ("407", ComplaintGroup.HEAD_INJURY),
        ("402", ComplaintGroup.CONFUSED_DROWSY),
        ("854", ComplaintGroup.CONFUSED_DROWSY),
        ("251", ComplaintGroup.GENERAL),
        ("999", ComplaintGroup.GENERAL),
        (None, ComplaintGroup.GENERAL),
    ],
)
def test_cedis_code_selects_group(bank, cedis, group):
    assert bank.complaint_group(cedis) is group


@pytest.mark.parametrize(
    ("cedis", "exclusion"),
    [
        ("458", AppExclusion.PREGNANCY_OVER_20_WEEKS),
        ("351", AppExclusion.SELF_HARM_OR_VIOLENCE),
        ("355", AppExclusion.SELF_HARM_OR_VIOLENCE),
        ("801", AppExclusion.MAJOR_TRAUMA),
        ("609", AppExclusion.CHILD),
        ("003", None),
        (None, None),
    ],
)
def test_cedis_code_suggests_exclusion(bank, cedis, exclusion):
    assert bank.app_exclusion(cedis) is exclusion


def test_every_group_except_general_has_codes(bank):
    assert set(bank.group_by_cedis.values()) == set(ComplaintGroup) - {ComplaintGroup.GENERAL}
    assert set(bank.exclusion_by_cedis.values()) == set(AppExclusion)


# --- branching -------------------------------------------------------------


def test_general_group_gets_no_follow_ups(bank):
    assert bank.follow_ups(ComplaintGroup.GENERAL, "251", {}) == ([], [])


def test_chest_pain_follow_ups_branch_on_answers(bank):
    now, later = bank.follow_ups(ComplaintGroup.CHEST_BACK_PAIN, "003", {})
    assert now == ["pain_moved", "pain_sudden_worse"]
    assert later == []
    now, later = bank.follow_ups(ComplaintGroup.CHEST_BACK_PAIN, "003", {"pain_moved": True})
    assert now == ["pain_moved", "pain_new_location", "pain_sudden_worse"]
    assert later == ["change_started"]
    # A "not sure" is never treated as yes.
    assert bank.follow_ups(ComplaintGroup.CHEST_BACK_PAIN, "003", {"pain_moved": False})[1] == []


def test_headache_question_only_for_headache_complaint(bank):
    assert "headache_sudden_worse" in bank.follow_ups(ComplaintGroup.NEURO_CHANGE, "404", {})[0]
    assert "headache_sudden_worse" not in bank.follow_ups(ComplaintGroup.NEURO_CHANGE, "403", {})[0]


def test_head_injury_and_confused_share_items(bank):
    head, _ = bank.follow_ups(ComplaintGroup.HEAD_INJURY, "407", {})
    confused, _ = bank.follow_ups(ComplaintGroup.CONFUSED_DROWSY, "402", {})
    assert head == ["harder_to_wake", "vomit_count", "headache_change", "seizure", "more_confused"]
    assert confused == ["harder_to_wake", "seizure", "more_confused"]


@pytest.mark.parametrize("group", list(ComplaintGroup))
def test_neuro_finding_offers_last_known_well_in_any_group(bank, group):
    _, later = bank.follow_ups(group, None, {"new_findings": ["chest_pain", "speech_change"]})
    assert "last_known_well" in later
    _, later = bank.follow_ups(group, None, {"new_findings": ["chest_pain"]})
    assert "last_known_well" not in later


def test_not_sure_never_opens_a_follow_up(bank):
    answers = raw_answers({"pain_moved": Missing(kind="missing", reason="unsure")})
    assert bank.follow_ups(ComplaintGroup.CHEST_BACK_PAIN, "003", answers)[1] == []
    answers = raw_answers({"pain_moved": YesNoAnswered(kind="yes_no", value=True)})
    assert bank.follow_ups(ComplaintGroup.CHEST_BACK_PAIN, "003", answers)[1] == ["change_started"]


def test_after_routing_items_are_never_asked_first(bank):
    for key in bank.section("follow_up"):
        if ext_value(bank.items[key], "ask-after-routing", False):
            for group in ComplaintGroup:
                assert key not in bank.follow_ups(group, None, {"pain_moved": True, "new_findings": ["facial_droop"]})[0]


def test_attention_params_are_sane(bank):
    p = bank.attention_params()
    assert 1 <= p.circles_min <= p.circles_max <= 20
    assert 0 <= p.squares_min <= p.squares_max
    assert p.show_ms >= 200 and p.gap_ms >= 0 and p.expires_minutes > 0


# --- enrolment ---------------------------------------------------------------


def enrol(**fields):
    body = {"submission_id": "00000000-0000-0000-0000-000000000001", "ctas": 3, "language": "en", "channel": "phone"}
    body.update(fields)
    return VisitCreate.model_validate(body)


def test_enrolment_accepts_choices_that_match_the_map(bank):
    check_enrolment(bank, enrol(complaint_group="confused_drowsy", cedis_code="402"))
    check_enrolment(bank, enrol(complaint_group="general", cedis_code="458", app_exclusion="child", channel=None))
    # Unlisted codes leave the group to the nurse, and any visit can be excluded.
    check_enrolment(bank, enrol(complaint_group="head_injury", cedis_code="704"))
    check_enrolment(bank, enrol(complaint_group="chest_back_pain", cedis_code="003", app_exclusion="child", channel=None))


def test_enrolment_rejects_an_app_for_an_excluded_complaint(bank):
    with pytest.raises(EnrolmentConflict, match="exclusion"):
        check_enrolment(bank, enrol(complaint_group="general", cedis_code="351"))


def test_enrolment_rejects_the_wrong_group(bank):
    with pytest.raises(EnrolmentConflict, match="confused_drowsy"):
        check_enrolment(bank, enrol(complaint_group="general", cedis_code="402"))


# --- the loader rejects broken banks --------------------------------------


def broken(mutate_q=None, mutate_m=None):
    q, m = copy.deepcopy(raw("questionnaire.json")), copy.deepcopy(raw("cedis-groups.json"))
    if mutate_q:
        mutate_q(q)
    if mutate_m:
        mutate_m(m)
    return q, m


def follow_up_items(q):
    return next(i for i in q["item"] if i["linkId"] == "follow_up")["item"]


def test_rejects_mismatched_versions(tmp_path):
    q, m = broken(mutate_m=lambda m: m.update(version="2026-01-01.1"))
    with pytest.raises(BankError, match="versions differ"):
        load_bank(write_bank(tmp_path, q, m))


def test_rejects_duplicate_link_ids(tmp_path):
    q, m = broken(mutate_q=lambda q: follow_up_items(q).append(copy.deepcopy(follow_up_items(q)[0])))
    with pytest.raises(BankError, match="duplicate linkId"):
        load_bank(write_bank(tmp_path, q, m))


def test_rejects_enable_when_on_unknown_item(tmp_path):
    def mutate(q):
        follow_up_items(q)[0]["enableWhen"][0]["question"] = "nope"

    q, m = broken(mutate_q=mutate)
    with pytest.raises(BankError, match="unknown item"):
        load_bank(write_bank(tmp_path, q, m))


def test_rejects_enable_when_on_unknown_option(tmp_path):
    def mutate(q):
        follow_up_items(q)[0]["enableWhen"][0]["answerCoding"]["code"] = "stomach_ache"

    q, m = broken(mutate_q=mutate)
    with pytest.raises(BankError, match="not an option"):
        load_bank(write_bank(tmp_path, q, m))


def test_rejects_enable_when_with_the_wrong_code_system(tmp_path):
    def mutate(q):
        follow_up_items(q)[0]["enableWhen"][0]["answerCoding"]["system"] = "urn:other"

    q, m = broken(mutate_q=mutate)
    with pytest.raises(BankError, match="not an option"):
        load_bank(write_bank(tmp_path, q, m))


def test_rejects_follow_up_without_a_contract_answer_kind(tmp_path):
    def mutate(q):
        follow_up_items(q)[0]["type"] = "date"

    q, m = broken(mutate_q=mutate)
    with pytest.raises(BankError, match="no contract answer kind"):
        load_bank(write_bank(tmp_path, q, m))


def test_rejects_cedis_code_both_grouped_and_excluded(tmp_path):
    def mutate(m):
        m["group"][1]["element"].append({"code": "003", "target": [{"code": "child", "equivalence": "wider"}]})

    q, m = broken(mutate_m=mutate)
    with pytest.raises(BankError, match="both grouped and excluded"):
        load_bank(write_bank(tmp_path, q, m))


def test_rejects_unknown_group_target(tmp_path):
    def mutate(m):
        m["group"][0]["element"][0]["target"][0]["code"] = "abdominal_pain"

    q, m = broken(mutate_m=mutate)
    with pytest.raises(BankError, match="abdominal_pain"):
        load_bank(write_bank(tmp_path, q, m))
