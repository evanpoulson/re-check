"""Enrolment, token exchange and visit state.

No name or health number appears anywhere in the contract.
"""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, StringConstraints, model_validator

from .codes import Channel, ComplaintGroup, Language, Reporter, VisitStatus
from .common import Ctas, InputModel, OutputModel, SubmissionId, Timestamp

PagerNumber = Annotated[str, StringConstraints(pattern=r"^[0-9]{1,6}$")]
CedisCode = Annotated[str, StringConstraints(pattern=r"^[0-9]{3}$")]
SiteId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_-]{0,31}$")]


class VisitCreate(InputModel):
    """Triage nurse enrols a waiting patient (FR1). Four fields plus the pager number if used."""

    submission_id: SubmissionId
    ctas: Ctas
    complaint_group: ComplaintGroup
    cedis_code: CedisCode | None = Field(
        default=None, description="CEDIS presenting complaint code, kept with its source vocabulary."
    )
    language: Language
    channel: Literal[Channel.PHONE, Channel.PAGER]
    pager_no: PagerNumber | None = None

    @model_validator(mode="after")
    def _pager_number_matches_channel(self) -> Self:
        if self.channel is Channel.PAGER and self.pager_no is None:
            raise ValueError("pager_no is required for the pager channel")
        if self.channel is Channel.PHONE and self.pager_no is not None:
            raise ValueError("pager_no is only allowed for the pager channel")
        return self


class VisitEnrolled(OutputModel):
    """Returned once at enrolment. The links carry the raw tokens and are never shown again."""

    visit_id: UUID
    patient_link: str = Field(description="URL for the patient QR card. Single-use, binds the first device.")
    companion_link: str = Field(description="URL for the companion QR card (FR11). Single-use.")
    links_expire_at: Timestamp
    pager_no: PagerNumber | None = None


class TokenExchange(InputModel):
    """A device opens a QR link and trades the one-time token for a session cookie."""

    token: Annotated[str, StringConstraints(min_length=22, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")] = Field(
        description="URL-safe random token, at least 128 bits."
    )


class SessionInfo(OutputModel):
    """Body returned with the session cookie. The session itself is an HttpOnly cookie."""

    role: Literal[Reporter.PATIENT, Reporter.COMPANION]
    language: Language
    expires_at: Timestamp


class VisitStatusUpdate(InputModel):
    submission_id: SubmissionId
    status: Literal[VisitStatus.ROOMED, VisitStatus.LEFT, VisitStatus.DISCHARGED]


class VisitSummary(OutputModel):
    visit_id: UUID
    site_id: SiteId
    ctas: Ctas
    complaint_group: ComplaintGroup
    cedis_code: CedisCode | None
    language: Language
    channel: Literal[Channel.PHONE, Channel.PAGER]
    pager_no: PagerNumber | None
    status: VisitStatus
    triaged_at: Timestamp
    closed_at: Timestamp | None
    next_prompt_due_at: Timestamp | None = Field(description="Next patient check-in prompt.")
    staff_reassess_due_at: Timestamp | None = Field(
        description="Staff reassessment deadline. A patient report never moves this."
    )
    last_staff_check_at: Timestamp | None
