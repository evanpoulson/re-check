import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError

from recheck.contract import (
    VisitCreate,
    VitalsCreate,
    contract_json_schema,
    patient_report_adapter,
)
from recheck.contract.answers import Missing, PainAnswered
from recheck.contract.codes import Disposition, StaffRole, TaskLevel, TaskStatus
from recheck.contract.reports import CheckinReport, ConcernReport
from recheck.contract.staff import StaffRef
from recheck.contract.tasks import EvidenceRef, Task, TaskReason

NOW = "2026-11-07T20:15:00-07:00"


def checkin(**overrides):
    body = {
        "kind": "checkin",
        "submission_id": str(uuid4()),
        "reporter": "patient",
        "channel": "phone",
        "captured_at": NOW,
        "questionnaire_version": "2026-11-07.1",
        "overall": {"kind": "answered", "value": "worse"},
        "pain": {"kind": "answered", "value": 7},
        "new_findings": {"kind": "answered", "value": []},
    }
    body.update(overrides)
    return body


# --- reports ---------------------------------------------------------------


def test_checkin_parses_from_json():
    report = patient_report_adapter.validate_json(json.dumps(checkin()))
    assert isinstance(report, CheckinReport)
    assert isinstance(report.pain, PainAnswered)
    assert report.pain.value == 7


def test_kind_selects_the_report_type():
    body = {
        "kind": "concern",
        "submission_id": str(uuid4()),
        "reporter": "companion",
        "channel": "phone",
        "captured_at": NOW,
        "concern": "worried",
    }
    assert isinstance(patient_report_adapter.validate_python(body), ConcernReport)


def test_unknown_fields_are_rejected_at_every_level():
    with pytest.raises(ValidationError):
        patient_report_adapter.validate_python(checkin(name="Jane Doe"))
    with pytest.raises(ValidationError):
        patient_report_adapter.validate_python(checkin(pain={"kind": "answered", "value": 3, "extra": 1}))


def test_missing_answer_needs_a_reason():
    report = patient_report_adapter.validate_python(checkin(pain={"kind": "missing", "reason": "unsure"}))
    assert isinstance(report.pain, Missing)
    with pytest.raises(ValidationError):
        patient_report_adapter.validate_python(checkin(pain={"kind": "missing"}))


def test_strings_and_floats_are_not_coerced_to_pain():
    for bad in ("7", 7.0, True):
        with pytest.raises(ValidationError):
            patient_report_adapter.validate_python(checkin(pain={"kind": "answered", "value": bad}))


@given(st.integers())
def test_pain_accepts_exactly_0_to_10(value):
    body = checkin(pain={"kind": "answered", "value": value})
    if 0 <= value <= 10:
        patient_report_adapter.validate_python(body)
    else:
        with pytest.raises(ValidationError):
            patient_report_adapter.validate_python(body)


def test_naive_timestamps_are_rejected():
    with pytest.raises(ValidationError):
        patient_report_adapter.validate_python(checkin(captured_at="2026-11-07T20:15:00"))


def test_duplicate_findings_are_rejected():
    with pytest.raises(ValidationError):
        patient_report_adapter.validate_python(
            checkin(new_findings={"kind": "answered", "value": ["chest_pain", "chest_pain"]})
        )


def test_companion_cannot_report_pain():
    with pytest.raises(ValidationError, match="self-reported"):
        patient_report_adapter.validate_python(checkin(reporter="companion"))
    patient_report_adapter.validate_python(
        checkin(reporter="companion", pain={"kind": "missing", "reason": "not_asked"})
    )


def test_staff_cannot_send_patient_reports():
    with pytest.raises(ValidationError):
        patient_report_adapter.validate_python(checkin(reporter="staff"))
    with pytest.raises(ValidationError):
        patient_report_adapter.validate_python(checkin(channel="desk"))


def test_complaint_items_use_their_own_answer_types():
    report = patient_report_adapter.validate_python(
        checkin(
            items={
                "pain_spread": {"kind": "yes_no", "value": True},
                "pain_location": {"kind": "multi_choice", "value": ["back", "left_arm"]},
                "onset": {"kind": "missing", "reason": "not_reached"},
            }
        )
    )
    assert set(report.items) == {"pain_spread", "pain_location", "onset"}
    with pytest.raises(ValidationError):
        patient_report_adapter.validate_python(checkin(items={"Bad Key": {"kind": "yes_no", "value": True}}))


# --- enrolment -------------------------------------------------------------


def visit(**overrides):
    body = {
        "submission_id": str(uuid4()),
        "ctas": 3,
        "complaint_group": "chest_back_pain",
        "language": "en",
        "channel": "phone",
    }
    body.update(overrides)
    return body


@pytest.mark.parametrize("ctas", [0, 1, 6])
def test_enrolment_rejects_ctas_outside_waiting_room(ctas):
    with pytest.raises(ValidationError):
        VisitCreate.model_validate(visit(ctas=ctas))


def test_pager_number_must_match_channel():
    VisitCreate.model_validate(visit(channel="pager", pager_no="12"))
    with pytest.raises(ValidationError):
        VisitCreate.model_validate(visit(channel="pager"))
    with pytest.raises(ValidationError):
        VisitCreate.model_validate(visit(pager_no="12"))


# --- vitals ----------------------------------------------------------------


def vitals(**overrides):
    body = {"submission_id": str(uuid4()), "visit_id": str(uuid4()), "measured_at": NOW}
    body.update(overrides)
    return body


def test_vitals_need_at_least_one_value():
    with pytest.raises(ValidationError, match="at least one"):
        VitalsCreate.model_validate(vitals())
    VitalsCreate.model_validate(vitals(sbp=210, dbp=110))


def test_blood_pressure_is_entered_as_a_pair():
    with pytest.raises(ValidationError):
        VitalsCreate.model_validate(vitals(sbp=210))
    with pytest.raises(ValidationError):
        VitalsCreate.model_validate(vitals(sbp=90, dbp=120))


# --- tasks -----------------------------------------------------------------


def task(**overrides):
    created = datetime(2026, 11, 7, 20, 15, tzinfo=timezone.utc)
    fields = dict(
        task_id=uuid4(),
        visit_id=uuid4(),
        level=TaskLevel.RED,
        status=TaskStatus.OPEN,
        escalated=False,
        routed_to=[StaffRole.PHYSICIAN],
        reasons=[
            TaskReason(
                rule_id="worse_twice",
                rule_version="demo-1",
                level=TaskLevel.RED,
                reason_code="worse_twice_90_min",
                evidence=[EvidenceRef(kind="report", id=uuid4())],
                fired_at=created,
            )
        ],
        created_at=created,
        ack_due_at=created + timedelta(minutes=15),
        delivered_at=None,
        acknowledged_at=None,
        acknowledged_by=None,
        assessed_at=None,
        assessed_by=None,
        disposition=None,
    )
    fields.update(overrides)
    return Task(**fields)


def test_acknowledged_is_separate_from_assessed():
    doc = StaffRef(user_id="auth0|tlp", role=StaffRole.PHYSICIAN)
    at = datetime(2026, 11, 7, 20, 20, tzinfo=timezone.utc)
    task(status=TaskStatus.ACKNOWLEDGED, acknowledged_at=at, acknowledged_by=doc)
    task(
        status=TaskStatus.COMPLETED,
        acknowledged_at=at,
        acknowledged_by=doc,
        assessed_at=at,
        assessed_by=doc,
        disposition=Disposition.ASSESSED_STABLE,
    )
    with pytest.raises(ValidationError):
        task(status=TaskStatus.COMPLETED, acknowledged_at=at, acknowledged_by=doc)
    with pytest.raises(ValidationError):
        task(status=TaskStatus.OPEN, acknowledged_at=at, acknowledged_by=doc)


def test_task_levels_rank_in_physician_list_order():
    assert [lvl.value for lvl in sorted(TaskLevel, key=lambda l: l.rank, reverse=True)] == [
        "red",
        "amber",
        "silent",
        "leave_risk",
        "overdue",
    ]


# --- generated schema ------------------------------------------------------


def test_json_schema_builds_for_typescript_generation():
    schema = contract_json_schema()
    defs = schema["$defs"]
    assert {"VisitCreate", "CheckinReport", "Task", "Worklist"} <= set(defs)
    # Discriminated unions come out as oneOf with a discriminator mapping.
    detail = json.dumps(defs["ReportRecord"])
    assert "discriminator" in detail
    # Input models forbid extra fields in the schema too.
    assert defs["VisitCreate"]["additionalProperties"] is False


def test_patient_screens_cannot_see_staff_fields():
    schema = contract_json_schema()["$defs"]
    patient_fields = set(schema["PatientHome"]["properties"]) | set(schema["ReportReceipt"]["properties"])
    assert not patient_fields & {"level", "reasons", "routed_to", "task_id", "acknowledged_by"}
