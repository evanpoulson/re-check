"""What the patient or companion screen loads: questions, the circle check, the wait estimate.

Matches the web app's mock server (web/src/api/mocks/store.ts, patientHome):
- `items` are the follow-up questions enabled by the visit's complaint and
  everything answered so far (the screen renders the base check-in itself).
- A patient gets a circle-counting prompt; an unexpired, unanswered one is
  reused, otherwise a new one is issued and stored so the answer can be scored.
  A companion never gets one.
- Nothing staff-only (task level, reasons) is ever returned.
"""

import json
import random
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from ..attention import generate
from ..auth import Pool, VisitSession, current_visit_session
from ..contract.codes import ComplaintGroup, ItemInputType, PatientMessage, Reporter
from ..contract.patient import AttentionPrompt, AttentionStep, PatientHome, QuestionItem, QuestionOption
from ..db import write_tx
from ..question_bank import QuestionBank, default_bank, ext_value
from ..wait_times.estimate import Snapshot, current_estimate, waited_minutes

router = APIRouter(prefix="/api/patient", tags=["patient home"])

_rng = random.SystemRandom()


def question_item(bank: QuestionBank, key: str, role: Reporter) -> QuestionItem:
    """A bank item in the answerer's wording (the mock's questionItem)."""
    item = bank.items[key]
    text = (ext_value(item, "companion-text") if role is Reporter.COMPANION else None) or item.get("text") or key
    if item["type"] == "boolean":
        input_type = ItemInputType.YES_NO
    elif item["type"] == "integer":
        input_type = ItemInputType.SCALE
    elif item.get("repeats"):
        input_type = ItemInputType.MULTI_CHOICE
    else:
        input_type = ItemInputType.CHOICE
    options = [
        QuestionOption(code=o["valueCoding"]["code"], text=o["valueCoding"].get("display") or o["valueCoding"]["code"])
        for o in item.get("answerOption", [])
    ]
    allow_unsure = ext_value(item, "allow-unsure")
    return QuestionItem(
        key=key, input_type=input_type, text=text, options=options,
        allow_unsure=True if allow_unsure is None else bool(allow_unsure),
    )


async def answers_so_far(conn, visit_id) -> dict[str, Any]:
    """Raw answers from every report on the visit, latest wins, plus all findings reported.

    Missing answers are left out, so "not sure" never enables a follow-up.
    """
    cur = await conn.execute(
        "SELECT items, findings::text[] FROM report WHERE visit_id = %s ORDER BY received_at", [visit_id]
    )
    answers: dict[str, Any] = {}
    findings: list[str] = []
    for items, row_findings in await cur.fetchall():
        for key, answer in (items or {}).items():
            if answer.get("kind") != "missing":
                answers[key] = answer.get("value")
        for code in row_findings or []:
            if code not in findings:
                findings.append(code)
    answers["new_findings"] = findings
    return answers


async def attention_prompt(conn, bank: QuestionBank, visit_id) -> AttentionPrompt:
    """The visit's live prompt, or a new one stored for scoring."""
    cur = await conn.execute(
        """
        SELECT id, steps, show_ms, gap_ms, expires_at FROM attention_prompt p
        WHERE visit_id = %s AND expires_at > now()
          AND NOT EXISTS (SELECT 1 FROM report r WHERE r.attention_prompt_id = p.id)
        ORDER BY issued_at DESC LIMIT 1
        """,
        [visit_id],
    )
    row = await cur.fetchone()
    if row is None:
        params = bank.attention_params()
        seq = generate(_rng, params)
        steps = [{"shape": s.shape, "x": s.x, "y": s.y} for s in seq.steps]
        cur = await conn.execute(
            """
            INSERT INTO attention_prompt (visit_id, questionnaire_version, expires_at, steps, show_ms, gap_ms,
                                          expected_count)
            VALUES (%s, %s, now() + make_interval(mins => %s), %s::jsonb, %s, %s, %s)
            RETURNING id, steps, show_ms, gap_ms, expires_at
            """,
            [visit_id, bank.version, params.expires_minutes, json.dumps(steps), params.show_ms, params.gap_ms,
             seq.expected_count],
        )
        row = await cur.fetchone()
    prompt_id, steps, show_ms, gap_ms, expires_at = row
    return AttentionPrompt(
        prompt_id=prompt_id,
        steps=[AttentionStep(**s) for s in steps],
        show_ms=show_ms,
        gap_ms=gap_ms,
        expires_at=expires_at,
    )


async def load_snapshots(conn, site_id: str) -> tuple[Snapshot | None, Snapshot | None]:
    """(latest, last_ok) wait snapshots for the site; async twin of wait_times.estimate.load_snapshots."""
    sql = "SELECT fetched_at, status::text, minutes FROM wait_snapshot WHERE site_id = %s {} ORDER BY fetched_at DESC LIMIT 1"
    cur = await conn.execute(sql.format(""), [site_id])
    latest = await cur.fetchone()
    cur = await conn.execute(sql.format("AND status = 'ok'"), [site_id])
    last_ok = await cur.fetchone()
    return (Snapshot(*latest) if latest else None, Snapshot(*last_ok) if last_ok else None)


@router.get(
    "/home",
    response_model=PatientHome,
    responses={401: {"description": "Not signed in, or this device was signed out"}},
)
async def patient_home(
    session: Annotated[VisitSession, Depends(current_visit_session)], pool: Pool
) -> PatientHome:
    """Everything the check-in screen shows. The screen refetches it every minute."""
    bank = default_bank()
    # A write transaction because a new circle prompt may be stored (and audited).
    async with write_tx(pool, session.actor) as conn:
        cur = await conn.execute(
            "SELECT site_id, language, triaged_at, next_prompt_due_at, complaint_group, cedis_code"
            " FROM visit WHERE id = %s",
            [session.visit_id],
        )
        site_id, language, triaged_at, next_due, complaint_group, cedis_code = await cur.fetchone()

        now, later = bank.follow_ups(
            ComplaintGroup(complaint_group), cedis_code, await answers_so_far(conn, session.visit_id)
        )
        items = [question_item(bank, key, session.role) for key in now + later]
        prompt = await attention_prompt(conn, bank, session.visit_id) if session.role is Reporter.PATIENT else None
        latest, last_ok = await load_snapshots(conn, site_id)

    at = datetime.now(UTC)
    return PatientHome(
        role=session.role,
        language=language,
        wait_estimate=current_estimate(latest, last_ok, at),
        waited_minutes=waited_minutes(triaged_at, at),
        next_checkin_due_at=next_due,
        questionnaire_version=bank.version,
        items=items,
        attention_prompt=prompt,
        message=PatientMessage.NONE,
    )
