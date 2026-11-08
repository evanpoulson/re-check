"""Enrolment, token exchange and visit state.

No name or health number appears anywhere in the contract.
"""

from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, StringConstraints, model_validator

from .codes import AppExclusion, Channel, ComplaintGroup, Language, Reporter, VisitStatus
from .common import Ctas, InputModel, OutputModel, SubmissionId, Timestamp

PagerNumber = Annotated[str, StringConstraints(pattern=r"^[0-9]{1,6}$")]
CedisCode = Annotated[str, StringConstraints(pattern=r"^[0-9]{3}$")]
SiteId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_-]{0,31}$")]


class VisitCreate(InputModel):
    """Triage nurse enrols a waiting patient (FR1)."""

    submission_id: SubmissionId
    ctas: Ctas
    complaint_group: ComplaintGroup
    cedis_code: CedisCode | None = Field(
        default=None, description="CEDIS presenting complaint code, kept with its source vocabulary."
    )
    language: Language
    app_exclusion: AppExclusion | None = Field(
        default=None,
        description=(
            "Set when the patient app is not offered. The visit still appears on the staff list "
            "and the staff reassessment timer still runs, but no QR is issued and no prompts are sent."
        ),
    )
    channel: Literal[Channel.PHONE, Channel.PAGER] | None = Field(
        default=None, description="Required unless the app is not offered."
    )
    pager_no: PagerNumber | None = None

    @model_validator(mode="after")
    def _channel_matches_offer(self) -> Self:
        if self.app_exclusion is not None:
            if self.channel is not None or self.pager_no is not None:
                raise ValueError("no channel or pager is set when the app is not offered")
            return self
        if self.channel is None:
            raise ValueError("channel is required when the app is offered")
        if self.channel is Channel.PAGER and self.pager_no is None:
            raise ValueError("pager_no is required for the pager channel")
        if self.channel is Channel.PHONE and self.pager_no is not None:
            raise ValueError("pager_no is only allowed for the pager channel")
        return self


SignInRole = Literal[Reporter.PATIENT, Reporter.COMPANION]


class VisitEnrolled(OutputModel):
    """Returned at enrolment. One QR per visit; whoever scans it chooses patient or companion.

    When the app is not offered, there is no link.
    """

    visit_id: UUID
    app_exclusion: AppExclusion | None = None
    link: str | None = Field(
        description=(
            "URL for the visit's QR. Works while the visit is waiting; one device signed in at a time."
        )
    )
    pager_no: PagerNumber | None = None

    @model_validator(mode="after")
    def _link_matches_offer(self) -> Self:
        if self.app_exclusion is None and self.link is None:
            raise ValueError("an app visit needs a link")
        if self.app_exclusion is not None and any(v is not None for v in (self.link, self.pager_no)):
            raise ValueError("a visit without the app has no link or pager")
        return self


class VisitLink(OutputModel):
    """The visit's QR again, for the desk to show from the staff app (for example to switch who is signed in).

    The server decrypts the stored token to rebuild the same link, and records the
    re-show with `log_qr_shown` in the same transaction. Refused for a visit that is
    closed or doesn't offer the app.
    """

    visit_id: UUID
    link: str


class VisitExclusionUpdate(InputModel):
    """Staff stop offering the app after enrolment.

    The server revokes the visit's sessions and stops patient prompts. The staff
    timer keeps running. An exclusion can't be removed once set.
    """

    submission_id: SubmissionId
    app_exclusion: AppExclusion


class TokenExchange(InputModel):
    """A device scans the visit's QR, says who is using it, and gets a session cookie.

    Only one device is signed in per visit. If one already is, the server answers
    409 with `SignInConflict`. After the person confirms "This will sign out the
    other device", the client resends with `takeover_session_id` from that 409.
    The server signs out exactly that session; if it is no longer the open one
    (someone else took over meanwhile), or two sign-ins race, it answers 409
    again with the current state.
    """

    token: Annotated[str, StringConstraints(min_length=22, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")] = Field(
        description="URL-safe random token, at least 128 bits."
    )
    role: SignInRole = Field(description='"I\'m the patient" or "I\'m with the patient".')
    takeover_session_id: UUID | None = Field(
        default=None,
        description="The session named in the 409, sent only after the person confirms signing it out.",
    )


class SignInConflict(OutputModel):
    """409 body: someone is already signed in for this visit. Ask before taking over."""

    session_id: UUID = Field(description="Send back as `takeover_session_id` to confirm.")
    signed_in_as: SignInRole
    signed_in_since: Timestamp


class SignOut(InputModel):
    """The person signs this device out. The visit's QR still works for the next sign-in."""

    submission_id: SubmissionId


class StaffSignOut(InputModel):
    """Staff sign out whichever device is signed in to a visit (for example a lost phone).

    The visit comes from the path and the staff member from the staff session.
    """

    submission_id: SubmissionId


class SessionInfo(OutputModel):
    """Body returned with the session cookie. The session itself is an HttpOnly cookie."""

    role: SignInRole
    language: Language
    replaced_other_device: bool = Field(description="True if signing in signed another device out.")


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
    app_exclusion: AppExclusion | None
    channel: Literal[Channel.PHONE, Channel.PAGER] | None
    pager_no: PagerNumber | None
    status: VisitStatus
    triaged_at: Timestamp
    closed_at: Timestamp | None
    next_prompt_due_at: Timestamp | None = Field(description="Next patient check-in prompt.")
    staff_reassess_due_at: Timestamp | None = Field(
        description="Staff reassessment deadline. A patient report never moves this."
    )
    last_staff_check_at: Timestamp | None
    signed_in_as: SignInRole | None = Field(description="Who is signed in on the visit's device, if anyone.")
    signed_in_since: Timestamp | None

    @model_validator(mode="after")
    def _signed_in_fields_pair(self) -> Self:
        if (self.signed_in_as is None) != (self.signed_in_since is None):
            raise ValueError("signed_in_as and signed_in_since are set together")
        return self
