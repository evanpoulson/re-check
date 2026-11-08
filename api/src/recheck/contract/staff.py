"""Staff inputs: vitals, "flag higher", acknowledgement and assessment.

The acting staff member comes from the signed-in session, never from the body.
"""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, StringConstraints, model_validator

from .codes import Disposition, StaffRole
from .common import InputModel, OutputModel, SubmissionId, Timestamp

Sbp = Annotated[int, Field(strict=True, ge=40, le=300)]
Dbp = Annotated[int, Field(strict=True, ge=20, le=200)]
HeartRate = Annotated[int, Field(strict=True, ge=20, le=250)]
RespRate = Annotated[int, Field(strict=True, ge=4, le=60)]
Spo2 = Annotated[int, Field(strict=True, ge=50, le=100)]
TempC = Annotated[float, Field(ge=30, le=44)]

_VITAL_FIELDS = ("sbp", "dbp", "hr", "rr", "spo2", "temp_c")


class StaffRef(OutputModel):
    user_id: str
    role: StaffRole


class VitalsCreate(InputModel):
    """Repeat vitals entered by the triage nurse (FR17). Ranges reject typos, not abnormal values."""

    submission_id: SubmissionId
    visit_id: UUID
    measured_at: Timestamp
    sbp: Sbp | None = None
    dbp: Dbp | None = None
    hr: HeartRate | None = None
    rr: RespRate | None = None
    spo2: Spo2 | None = None
    temp_c: TempC | None = None
    supersedes: UUID | None = Field(
        default=None, description="ID of an earlier vitals record this one corrects. The original is kept."
    )

    @model_validator(mode="after")
    def _check_values(self) -> Self:
        if all(getattr(self, f) is None for f in _VITAL_FIELDS):
            raise ValueError("at least one measurement is required")
        if (self.sbp is None) != (self.dbp is None):
            raise ValueError("sbp and dbp must be entered together")
        if self.sbp is not None and self.dbp is not None and self.dbp >= self.sbp:
            raise ValueError("dbp must be lower than sbp")
        return self


class VitalsRecord(OutputModel):
    type: Literal["vitals"] = "vitals"
    vitals_id: UUID
    visit_id: UUID
    measured_at: Timestamp
    received_at: Timestamp
    entered_by: StaffRef
    sbp: int | None
    dbp: int | None
    hr: int | None
    rr: int | None
    spo2: int | None
    temp_c: float | None
    supersedes: UUID | None


class FlagHigher(InputModel):
    """Triage nurse's one-tap "flag higher" (FR17). Opens or raises an amber task."""

    submission_id: SubmissionId
    visit_id: UUID
    note: Annotated[str, StringConstraints(min_length=1, max_length=280)] | None = None


class FlagRecord(OutputModel):
    type: Literal["flag"] = "flag"
    flag_id: UUID
    visit_id: UUID
    received_at: Timestamp
    flagged_by: StaffRef
    note: str | None


class AcknowledgeTask(InputModel):
    """"I've seen this." Separate from assessment."""

    submission_id: SubmissionId


class AssessTask(InputModel):
    """Record the in-person outcome and complete the task (FR16)."""

    submission_id: SubmissionId
    disposition: Disposition


class SiteSettings(OutputModel):
    """Switches for the whole site, changed by the triage or charge nurse.

    A site that has never saved settings gets the defaults.
    """

    show_triage_level: bool = Field(
        description=(
            "When true, patients and companions see the level set at triage, in plain words. Off by default: "
            "no public AHS policy says whether staff share it (research brief §4a). Target times are never shown."
        )
    )
    updated_at: Timestamp | None = Field(description="Last change, or null while the site uses the defaults.")


class SiteSettingsUpdate(InputModel):
    """Replace the site's settings. Sending the same body again changes nothing, so retries are safe."""

    show_triage_level: bool
