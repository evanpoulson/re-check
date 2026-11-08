"""Load the versioned question bank, check it, and choose which questions to ask.

The bank lives in `question-bank/` at the repo root as FHIR R4 resources:

- `questionnaire.json`: every question, its wording and its branching (`enableWhen`).
- `cedis-groups.json`: CEDIS complaint code to complaint group and app exclusion.

This module only does branch selection: which questions to show. Clinical
review triggers and staff routing live in the rules, not here.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

from .contract.answers import ItemAnswer
from .contract.codes import AppExclusion, ComplaintGroup, Reporter
from .contract.visits import VisitCreate

BANK_DIR = Path(__file__).resolve().parents[3] / "question-bank"

EXT = "urn:recheck:fhir:"
CODES = "urn:recheck:codes:"
HIDDEN = "http://hl7.org/fhir/StructureDefinition/questionnaire-hidden"

CODE_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
VERSION_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
CEDIS_RE = re.compile(r"^[0-9]{3}$")

AnswerValue = bool | str | list[str] | int
"""A boolean, an option code, a list of option codes or an integer, keyed by item linkId."""


class BankError(ValueError):
    """The question bank files are inconsistent."""


def ext_values(element: Mapping[str, Any], name: str) -> list[Any]:
    """Values of every extension with this name (in our namespace or a full URL)."""
    url = name if "://" in name else EXT + name
    out = []
    for e in element.get("extension", []):
        if e["url"] == url:
            out.extend(v for k, v in e.items() if k.startswith("value"))
    return out


def ext_value(element: Mapping[str, Any], name: str, default: Any = None) -> Any:
    values = ext_values(element, name)
    if len(values) > 1:
        raise BankError(f"{element.get('linkId')}: extension {name} appears more than once")
    return values[0] if values else default


def walk(items: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    for item in items:
        yield item
        yield from walk(item.get("item", []))


def option_codes(item: Mapping[str, Any]) -> list[str]:
    return [o["valueCoding"]["code"] for o in item.get("answerOption", [])]


@dataclass(frozen=True)
class AttentionParams:
    """Circle-counting task settings, read from the `circle_count` item."""

    circles_min: int
    circles_max: int
    squares_min: int
    squares_max: int
    show_ms: int
    gap_ms: int
    expires_minutes: int


@dataclass(frozen=True)
class QuestionBank:
    version: str
    questionnaire: dict[str, Any]
    items: dict[str, dict[str, Any]]
    group_by_cedis: dict[str, ComplaintGroup]
    exclusion_by_cedis: dict[str, AppExclusion]

    def complaint_group(self, cedis_code: str | None) -> ComplaintGroup:
        """The complaint group for a CEDIS code. Unknown or missing codes fall back to general."""
        if cedis_code is None:
            return ComplaintGroup.GENERAL
        return self.group_by_cedis.get(cedis_code, ComplaintGroup.GENERAL)

    def app_exclusion(self, cedis_code: str | None) -> AppExclusion | None:
        """Suggested exclusion for a CEDIS code. The triage nurse can also set one directly, such as by age."""
        if cedis_code is None:
            return None
        return self.exclusion_by_cedis.get(cedis_code)

    def section(self, link_id: str) -> list[str]:
        return [i["linkId"] for i in self.items[link_id].get("item", [])]

    def is_enabled(self, link_id: str, answers: Mapping[str, AnswerValue]) -> bool:
        item = self.items[link_id]
        conditions = item.get("enableWhen", [])
        if not conditions:
            return True
        results = [_condition_met(c, answers) for c in conditions]
        if len(results) == 1:
            return results[0]
        return any(results) if item["enableBehavior"] == "any" else all(results)

    def base_items(self, role: Reporter) -> list[str]:
        """Base check-in questions for whoever signed in. Pain and the circle check are patient only."""
        return [k for k in self.section("base") if self.is_enabled(k, {"session_role": role.value})]

    def follow_ups(
        self,
        complaint_group: ComplaintGroup,
        cedis_code: str | None,
        answers: Mapping[str, AnswerValue],
    ) -> tuple[list[str], list[str]]:
        """Follow-up questions enabled by the visit and the answers so far.

        Returns (ask now, ask after routing). Items marked ask-after-routing are
        offered only once any urgent finding has been routed.
        """
        context: dict[str, AnswerValue] = {"complaint_group": complaint_group.value}
        if cedis_code is not None:
            context["cedis_code"] = cedis_code
        merged = {**answers, **context}
        now, later = [], []
        for key in self.section("follow_up"):
            if self.is_enabled(key, merged):
                (later if ext_value(self.items[key], "ask-after-routing", False) else now).append(key)
        return now, later

    def attention_params(self) -> AttentionParams:
        item = self.items["circle_count"]

        def get(name: str) -> int:
            value = ext_value(item, f"attention-{name}")
            if not isinstance(value, int):
                raise BankError(f"circle_count: attention-{name} must be an integer")
            return value

        return AttentionParams(
            circles_min=get("circles-min"),
            circles_max=get("circles-max"),
            squares_min=get("squares-min"),
            squares_max=get("squares-max"),
            show_ms=get("show-ms"),
            gap_ms=get("gap-ms"),
            expires_minutes=get("expires-minutes"),
        )


def raw_answers(items: Mapping[str, ItemAnswer]) -> dict[str, AnswerValue]:
    """Turn contract item answers into the raw values branching uses. Missing answers are left out,
    so "not sure" never enables a follow-up."""
    return {key: answer.value for key, answer in items.items() if answer.kind != "missing"}


class EnrolmentConflict(ValueError):
    """The nurse's choice contradicts the CEDIS map."""


def check_enrolment(bank: QuestionBank, visit: VisitCreate) -> None:
    """The triage nurse picks the group and any exclusion; reject choices the CEDIS map contradicts.

    - A CEDIS code the map excludes must have an exclusion (the nurse can pick the reason).
    - A CEDIS code the map assigns to a group must use that group. Unlisted codes leave
      the group to the nurse.
    The nurse can always add an exclusion the map doesn't suggest, such as for age.
    """
    code = visit.cedis_code
    if code is None:
        return
    if code in bank.exclusion_by_cedis and visit.app_exclusion is None:
        raise EnrolmentConflict(
            f"CEDIS {code} is not offered the app ({bank.exclusion_by_cedis[code].value}); set an exclusion"
        )
    mapped = bank.group_by_cedis.get(code)
    if mapped is not None and visit.complaint_group is not mapped:
        raise EnrolmentConflict(f"CEDIS {code} belongs to {mapped.value}, not {visit.complaint_group.value}")


ITEM_TYPES = {"boolean", "choice", "integer"}
"""FHIR item types a follow-up can use: yes_no, choice or multi_choice, and scale (0 to 10)."""


def _condition_met(condition: Mapping[str, Any], answers: Mapping[str, AnswerValue]) -> bool:
    if condition["operator"] != "=":
        raise BankError(f"unsupported enableWhen operator {condition['operator']!r}")
    given = answers.get(condition["question"])
    if given is None:
        return False
    if "answerBoolean" in condition:
        return given is condition["answerBoolean"]
    if "answerCoding" in condition:
        expected = condition["answerCoding"]["code"]
        return expected in given if isinstance(given, list) else given == expected
    if "answerString" in condition:
        return given == condition["answerString"]
    raise BankError(f"unsupported enableWhen answer in {condition}")


def _read(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BankError(f"cannot read {path}: {exc}") from exc


def _cedis_maps(concept_map: Mapping[str, Any]) -> tuple[dict[str, ComplaintGroup], dict[str, AppExclusion]]:
    groups: dict[str, ComplaintGroup] = {}
    exclusions: dict[str, AppExclusion] = {}
    targets = {CODES + "complaint-group": (groups, ComplaintGroup), CODES + "app-exclusion": (exclusions, AppExclusion)}
    for group in concept_map["group"]:
        if group["target"] not in targets:
            raise BankError(f"unknown ConceptMap target {group['target']}")
        mapping, enum = targets[group["target"]]
        unmapped = group.get("unmapped")
        if unmapped is not None and (enum is not ComplaintGroup or unmapped["code"] != ComplaintGroup.GENERAL):
            raise BankError("only the complaint-group map may have a fallback, and it must be general")
        for element in group["element"]:
            code = element["code"]
            if not CEDIS_RE.match(code):
                raise BankError(f"bad CEDIS code {code!r}")
            if code in mapping:
                raise BankError(f"CEDIS code {code} is mapped twice in {group['target']}")
            if len(element["target"]) != 1:
                raise BankError(f"CEDIS code {code} must map to exactly one target")
            try:
                mapping[code] = enum(element["target"][0]["code"])
            except ValueError as exc:
                raise BankError(f"CEDIS code {code}: {exc}") from exc
    if not groups or not exclusions:
        raise BankError("the CEDIS map needs both a complaint-group and an app-exclusion group")
    return groups, exclusions


def _check_items(questionnaire: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    items: dict[str, dict[str, Any]] = {}
    for item in walk(questionnaire["item"]):
        key = item["linkId"]
        if not CODE_RE.match(key):
            raise BankError(f"linkId {key!r} is not a snake_case code")
        if key in items:
            raise BankError(f"duplicate linkId {key!r}")
        items[key] = item
        for code in option_codes(item):
            if not CODE_RE.match(code):
                raise BankError(f"{key}: option code {code!r} is not a snake_case code")
        if len(option_codes(item)) != len(set(option_codes(item))):
            raise BankError(f"{key}: duplicate option codes")
    for key, item in items.items():
        conditions = item.get("enableWhen", [])
        if len(conditions) > 1 and item.get("enableBehavior") not in ("any", "all"):
            raise BankError(f"{key}: several enableWhen conditions need enableBehavior")
        for condition in conditions:
            target = condition["question"]
            if target not in items:
                raise BankError(f"{key}: enableWhen refers to unknown item {target!r}")
            if "answerCoding" in condition:
                coding = condition["answerCoding"]
                options = {(o["valueCoding"]["system"], o["valueCoding"]["code"]) for o in items[target].get("answerOption", [])}
                if (coding.get("system"), coding["code"]) not in options:
                    raise BankError(f"{key}: enableWhen coding {coding} is not an option of {target}")
            _condition_met(condition, {})  # rejects unsupported operators and answer types
    for section in ("visit_context", "always_visible", "base", "follow_up"):
        if section not in items:
            raise BankError(f"missing section {section!r}")
    for child in items["follow_up"].get("item", []):
        if child["type"] not in ITEM_TYPES:
            raise BankError(f"{child['linkId']}: follow-up type {child['type']!r} has no contract answer kind")
        if child["type"] == "integer" and ext_value(child, "http://hl7.org/fhir/StructureDefinition/maxValue", 99) > 10:
            raise BankError(f"{child['linkId']}: integer follow-ups are 0 to 10 scales")
    return items


def load_bank(directory: Path = BANK_DIR) -> QuestionBank:
    """Load and check the bank. Raises BankError if the files disagree with each other."""
    questionnaire = _read(directory / "questionnaire.json")
    concept_map = _read(directory / "cedis-groups.json")
    for resource, kind in ((questionnaire, "Questionnaire"), (concept_map, "ConceptMap")):
        if resource.get("resourceType") != kind:
            raise BankError(f"expected a {kind}")
    version = questionnaire["version"]
    if not VERSION_RE.match(version):
        raise BankError(f"bad version {version!r}")
    if concept_map["version"] != version:
        raise BankError("questionnaire and CEDIS map versions differ")
    items = _check_items(questionnaire)
    groups, exclusions = _cedis_maps(concept_map)
    overlap = set(groups) & set(exclusions)
    if overlap:
        raise BankError(f"CEDIS codes both grouped and excluded: {sorted(overlap)}")
    bank = QuestionBank(
        version=version,
        questionnaire=questionnaire,
        items=items,
        group_by_cedis=groups,
        exclusion_by_cedis=exclusions,
    )
    bank.attention_params()
    return bank


@cache
def default_bank() -> QuestionBank:
    return load_bank()
