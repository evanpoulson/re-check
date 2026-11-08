"""Hardware pagers, for patients without a usable phone.

A pager is a shared site device with no visit session. It proves it is one of
the site's pagers with the `X-Pager-Key` header (RECHECK_PAGER_KEY) and names
its own number in the path. Its visit is the site's waiting visit that the
triage nurse gave that pager number at enrolment; `visit_pager_waiting_uq`
allows at most one. Reports are stored, routed and audited exactly like phone
reports (see `reports.store_report`), with channel `pager` and no session.

While its patient waits, a pager's state also carries what the phone's home
screen gets for its check-in (`/api/patient/home`): the visit's follow-up
questions and, while a check-in is open, the circle prompt. The pager's
screen is ASCII, so its questions are always in English.
"""

import hmac
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Path, status

from pydantic import Field

from ..auth import Pool
from ..contract.codes import Channel, ComplaintGroup, Reporter
from ..contract.common import OutputModel, Timestamp, Version
from ..contract.patient import AttentionPrompt, QuestionItem
from ..contract.reports import PatientReport, ReportReceipt
from ..db import write_tx
from ..question_bank import default_bank
from ..settings import pager_key, site_id
from ..wait_times.estimate import waited_minutes
from .patient import answers_so_far, attention_prompt, question_item
from .reports import store_report

router = APIRouter(prefix="/api/pager", tags=["pager"])

ENDPOINT = "pager.report"
# How long a pager keeps saying "go to the desk" after staff room its patient.
CALLED_FOR_MINUTES = 15

PagerNo = Annotated[str, Path(pattern=r"^[0-9]{1,6}$", description="The number printed on the pager")]


def pager_device(x_pager_key: Annotated[str | None, Header()] = None) -> None:
    """Only the site's pagers may use these routes."""
    expected = pager_key()
    if expected is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "pagers aren't set up on this server")
    if x_pager_key is None or not hmac.compare_digest(x_pager_key.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not one of this site's pagers")


class PagerState(OutputModel):
    """What a pager shows. The pager asks for it every few seconds."""

    pager_no: str
    state: Literal["unassigned", "waiting", "called"]
    server_time: Timestamp
    checkin_open: bool
    next_checkin_due_at: Timestamp | None
    waited_minutes: int | None
    questionnaire_version: Version
    items: list[QuestionItem] = Field(
        default_factory=list,
        description="The visit's follow-up questions, as PatientHome.items, in English. Empty unless waiting.",
    )
    attention_prompt: AttentionPrompt | None = Field(
        default=None, description="The circle check, as PatientHome.attention_prompt, while a check-in is open."
    )


STATE_SQL = """
    SELECT status::text, triaged_at, next_prompt_due_at,
           coalesce(next_prompt_due_at <= now(), false),
           coalesce(closed_at > now() - make_interval(mins => %s), false),
           now(), id, complaint_group::text, cedis_code
      FROM visit
     WHERE site_id = %s AND pager_no = %s AND app_exclusion IS NULL
     ORDER BY (status = 'waiting') DESC, triaged_at DESC
     LIMIT 1
"""


@router.get(
    "/{pager_no}",
    response_model=PagerState,
    dependencies=[Depends(pager_device)],
    responses={401: {"description": "Missing or wrong X-Pager-Key"}, 503: {"description": "Pagers are off"}},
)
async def pager_state(pager_no: PagerNo, pool: Pool) -> PagerState:
    """Whether the pager's patient is waiting, has a check-in open, or has been called to the desk.

    While waiting, also the visit's follow-up questions and, while a check-in is open,
    its circle prompt (a new prompt is stored and audited, so this is a write transaction).
    """
    bank = default_bank()
    async with write_tx(pool, f"patient|pager:{pager_no}") as conn:
        cur = await conn.execute(STATE_SQL, [CALLED_FOR_MINUTES, site_id(), pager_no])
        row = await cur.fetchone()
        if row is None:
            cur = await conn.execute("SELECT now()")
            (db_now,) = await cur.fetchone()
            return _idle(pager_no, db_now, bank.version)
        status_, triaged_at, next_due, checkin_open, recently_closed, db_now, visit_id, group, cedis = row
        if status_ == "waiting":
            now, later = bank.follow_ups(ComplaintGroup(group), cedis, await answers_so_far(conn, visit_id))
            prompt = await attention_prompt(conn, bank, visit_id) if checkin_open else None
            return PagerState(
                pager_no=pager_no,
                state="waiting",
                server_time=db_now,
                checkin_open=checkin_open,
                next_checkin_due_at=next_due,
                waited_minutes=waited_minutes(triaged_at, db_now),
                questionnaire_version=bank.version,
                items=[question_item(bank, key, Reporter.PATIENT, "en") for key in now + later],
                attention_prompt=prompt,
            )
    version = bank.version
    if status_ == "roomed" and recently_closed:
        return PagerState(
            pager_no=pager_no,
            state="called",
            server_time=db_now,
            checkin_open=False,
            next_checkin_due_at=None,
            waited_minutes=None,
            questionnaire_version=version,
        )
    return _idle(pager_no, db_now, version)


def _idle(pager_no: str, db_now: datetime, version: str) -> PagerState:
    return PagerState(
        pager_no=pager_no,
        state="unassigned",
        server_time=db_now,
        checkin_open=False,
        next_checkin_due_at=None,
        waited_minutes=None,
        questionnaire_version=version,
    )


@router.post(
    "/{pager_no}/reports",
    response_model=ReportReceipt,
    dependencies=[Depends(pager_device)],
    responses={
        401: {"description": "Missing or wrong X-Pager-Key"},
        404: {"description": "No waiting patient has this pager"},
        409: {"description": "submission_id reused for a different report, or the check-in isn't due yet"},
        422: {"description": "Not a pager report from the patient, or the question bank doesn't match"},
        503: {"description": "Pagers are off"},
    },
)
async def post_pager_report(pager_no: PagerNo, report: PatientReport, pool: Pool) -> ReportReceipt:
    """Store a pager report for the waiting patient holding this pager, and route anything urgent."""
    if report.channel is not Channel.PAGER:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "pager reports use channel: pager")
    if report.reporter is not Reporter.PATIENT:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "a pager reports as the patient")
    visit_id = await _waiting_visit(pool, pager_no)
    return await store_report(
        pool, report, visit_id=visit_id, session_id=None, actor=f"patient|pager:{pager_no}", endpoint=ENDPOINT
    )


async def _waiting_visit(pool, pager_no: str) -> UUID:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT id FROM visit WHERE site_id = %s AND pager_no = %s AND status = 'waiting' AND app_exclusion IS NULL",
            [site_id(), pager_no],
        )
        row = await cur.fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no waiting patient has this pager")
    return row[0]
