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
    Language,
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
    english_wording,
    ext_value,
    ext_values,
    load_bank,
    option_codes,
    raw_answers,
)

BASE_FIELDS = {"feeling_now", "feeling_change", "pain", "new_findings", "attention"}


@pytest.fixture(scope="module")
def bank() -> QuestionBank:
    return default_bank()


def write_bank(tmp_path: Path, questionnaire: dict, concept_map: dict) -> Path:
    (tmp_path / "questionnaire.json").write_text(json.dumps(questionnaire))
    (tmp_path / "cedis-groups.json").write_text(json.dumps(concept_map))
    return tmp_path


def raw(name: str) -> dict:
    return json.loads((BANK_DIR / name).read_text(encoding="utf-8"))


# --- the bank matches the contract ----------------------------------------


def test_bank_loads_and_versions_match(bank):
    assert re.match(r"^\d{4}-\d{2}-\d{2}\.\d+$", bank.version)


def test_option_codes_match_contract_code_lists(bank):
    assert option_codes(bank.items["feeling_now"]) == [c.value for c in FeelingNow]
    assert option_codes(bank.items["feeling_change"]) == [c.value for c in FeelingChange]
    assert set(option_codes(bank.items["new_findings"])) == {c.value for c in FindingCode}
    assert set(option_codes(bank.items["complaint_group"])) == {c.value for c in ComplaintGroup}
    assert set(option_codes(bank.items["session_role"])) == {Reporter.PATIENT.value, Reporter.COMPANION.value}
    assert "answerer" not in bank.items  # the role comes from sign-in


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
    assert bank.base_items(Reporter.PATIENT) == ["feeling_now", "feeling_change", "pain", "new_findings", "circle_count"]
    assert bank.base_items(Reporter.COMPANION) == ["feeling_now", "feeling_change", "new_findings"]


def test_unknown_is_not_sure_everywhere(bank):
    for key in bank.section("base") + bank.section("follow_up"):
        assert not {"dont_know", "not_sure", "unknown"} & set(option_codes(bank.items[key])), key


def test_every_question_and_button_has_companion_wording(bank):
    for key in bank.section("always_visible") + bank.section("base") + bank.section("follow_up"):
        if ext_values(bank.items[key], "reporter") == ["patient"]:
            continue
        assert ext_value(bank.items[key], "companion-text"), key


def test_every_question_cites_evidence_listed_in_sources(bank):
    sources = (BANK_DIR / "SOURCES.md").read_text(encoding="utf-8")
    for key in bank.section("base") + bank.section("follow_up"):
        evidence = ext_values(bank.items[key], "evidence")
        assert evidence, f"{key} has no evidence"
        for ref in evidence:
            assert f"`{ref}`" in sources, f"{key}: evidence {ref!r} is missing from SOURCES.md"


def test_every_language_has_a_current_translation(bank):
    """A bank wording change bumps the version, which needs every translation redone."""
    assert set(bank.translations) == {lang.value for lang in Language} - {"en"}
    for path in (BANK_DIR / "translations").glob("*.json"):
        assert json.loads(path.read_text(encoding="utf-8"))["bankVersion"] == bank.version, f"{path.name} is for an older bank"


def test_translations_cover_every_visible_string_and_nothing_hidden(bank):
    wording = english_wording(bank.questionnaire)
    assert "session_role" not in wording and "cedis_code" not in wording
    assert wording["new_findings"]["none"] == "None of these"
    for lang, data in bank.translations.items():
        for key, entry in data["items"].items():
            for field in ("text", "companion", "none"):
                if field in entry:
                    assert entry[field].strip(), f"{lang}: {key}.{field} is empty"
            assert all(v.strip() for v in entry.get("options", {}).values()), f"{lang}: {key} has an empty option"


def test_wording_follows_role_and_language(bank):
    text, labels = bank.wording("feeling_now", Reporter.COMPANION, "en")
    assert text == "How do they seem right now?"
    pa_text, pa_labels = bank.wording("feeling_now", Reporter.PATIENT, "pa")
    assert pa_text == bank.translations["pa"]["items"]["feeling_now"]["text"] != bank.items["feeling_now"]["text"]
    assert list(pa_labels) == list(labels)
    # No translation file for the language: English.
    assert bank.wording("feeling_now", Reporter.PATIENT, "xx")[0] == bank.items["feeling_now"]["text"]


def translation_for(questionnaire: dict, lang: str, version: str) -> dict:
    return {"language": lang, "bankVersion": version, "status": "draft", "items": english_wording(questionnaire)}


def test_translation_for_an_older_bank_falls_back_to_english(tmp_path):
    q, m = raw("questionnaire.json"), raw("cedis-groups.json")
    write_bank(tmp_path, q, m)
    (tmp_path / "translations").mkdir()
    (tmp_path / "translations" / "pa.json").write_text(json.dumps(translation_for(q, "pa", "2000-01-01.1")))
    assert load_bank(tmp_path).translations == {}


def test_translation_that_misses_a_string_is_rejected(tmp_path):
    q, m = raw("questionnaire.json"), raw("cedis-groups.json")
    write_bank(tmp_path, q, m)
    (tmp_path / "translations").mkdir()
    bad = translation_for(q, "pa", q["version"])
    del bad["items"]["pain"]
    (tmp_path / "translations" / "pa.json").write_text(json.dumps(bad))
    with pytest.raises(BankError, match="pa.json"):
        load_bank(tmp_path)


def test_translation_needs_a_known_status_and_language(tmp_path):
    q, m = raw("questionnaire.json"), raw("cedis-groups.json")
    write_bank(tmp_path, q, m)
    (tmp_path / "translations").mkdir()
    (tmp_path / "translations" / "en.json").write_text(json.dumps(translation_for(q, "en", q["version"])))
    with pytest.raises(BankError, match="language"):
        load_bank(tmp_path)


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


def test_api_serves_follow_ups_in_the_visit_language(bank):
    from recheck.routes.patient import question_item

    pa = bank.translations["pa"]["items"]["vomit_count"]
    item = question_item(bank, "vomit_count", Reporter.COMPANION, "pa")
    assert item.text == pa["companion"]
    assert [o.text for o in item.options] == [pa["options"][o.code] for o in item.options]
    assert question_item(bank, "vomit_count", Reporter.PATIENT, "en").text == bank.items["vomit_count"]["text"]
