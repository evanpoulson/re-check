"""Patient and companion reports: check-ins, concerns, findings and "I'm leaving".

The visit and reporter come from the visit-session cookie, never the body.
Urgent findings are routed in the same transaction that stores the report, so
a report is never saved without its task. A retry with the same submission ID
returns the original receipt with `duplicate: true` and writes nothing.
"""

import json
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from .. import events, rules, submissions, tasks
from ..attention import AttentionResult, PromptMismatch, score
from ..auth import Pool, VisitSession, current_visit_session
from ..contract.answers import AttentionAnswered
from ..contract.codes import Channel, ComplaintGroup, DashboardEventType
from ..contract.reports import CheckinReport, FindingReport, PatientReport, ReportReceipt
from ..db import write_tx
from ..question_bank import QuestionBank, default_bank, option_codes, ext_value, raw_answers

router = APIRouter(prefix="/api/patient", tags=["patient reports"])

ENDPOINT = "patient.report"


def _unprocessable(message: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, message)


# ---------------------------------------------------------------------------
# Question bank checks
# ---------------------------------------------------------------------------

ANSWER_KINDS = {"boolean": {"yes_no"}, "integer": {"scale"}, "choice": {"choice", "multi_choice"}}


def check_items(bank: QuestionBank, report: CheckinReport) -> None:
    """Item keys and option codes must exist in the bank version the report names."""
    if report.questionnaire_version != bank.version:
        raise _unprocessable(f"questionnaire_version {report.questionnaire_version} is not the current {bank.version}")
    follow_ups = set(bank.section("follow_up"))
    for key, answer in report.items.items():
        if key not in follow_ups:
            raise _unprocessable(f"{key} is not a follow-up question in questionnaire {bank.version}")
        if answer.kind == "missing":
            continue
        item = bank.items[key]
        if answer.kind not in ANSWER_KINDS[item["type"]]:
            raise _unprocessable(f"{key} takes a {item['type']} answer, not {answer.kind}")
        if item["type"] == "choice":
            multiple = bool(ext_value(item, "multiple", False) or item.get("repeats"))
            if (answer.kind == "multi_choice") != multiple:
                raise _unprocessable(f"{key} takes {'several choices' if multiple else 'one choice'}")
            values = answer.value if answer.kind == "multi_choice" else [answer.value]
            unknown = set(values) - set(option_codes(item))
            if unknown:
                raise _unprocessable(f"{key} has no option {sorted(unknown)[0]}")


def follow_up_items(bank: QuestionBank, visit: dict, report: PatientReport) -> list[str]:
    """Questions to ask next. For a check-in: enabled items not yet answered. For a finding: items the finding enables."""
    group, cedis = ComplaintGroup(visit["complaint_group"]), visit["cedis_code"]
    findings = [f.value for f in rules.findings_of(report)]
    if isinstance(report, CheckinReport):
        answers = {**raw_answers(report.items), "new_findings": findings}
        now, later = bank.follow_ups(group, cedis, answers)
        return [k for k in now + later if k not in report.items]
    if isinstance(report, FindingReport):
        now, later = bank.follow_ups(group, cedis, {"new_findings": findings})
        before_now, before_later = bank.follow_ups(group, cedis, {"new_findings": []})
        return [k for k in now + later if k not in before_now + before_later]
    return []


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


def _answer(value_and_missing, answer) -> tuple:
    """(value, missing_reason) columns for an answered-or-missing field."""
    if answer.kind == "missing":
        return None, answer.reason.value
    return value_and_missing(answer), None


def report_row(report: PatientReport, session: VisitSession) -> dict:
    row = {
        "id": report.submission_id,
        "visit_id": session.visit_id,
        "captured_at": report.captured_at,
        "kind": report.kind,
        "reporter": report.reporter.value,
        "channel": report.channel.value,
        "session_id": session.session_id,
        "questionnaire_version": None,
        "feeling_now": None, "feeling_now_missing": None,
        "feeling_change": None, "feeling_change_missing": None,
        "pain": None, "pain_missing": None,
        "findings": None, "findings_missing": None,
        "attention_prompt_id": None, "attention_count": None, "attention_missing": None,
        "items": "{}",
        "concern": None,
    }
    if isinstance(report, CheckinReport):
        row["questionnaire_version"] = report.questionnaire_version
        row["feeling_now"], row["feeling_now_missing"] = _answer(lambda a: a.value.value, report.feeling_now)
        row["feeling_change"], row["feeling_change_missing"] = _answer(lambda a: a.value.value, report.feeling_change)
        row["pain"], row["pain_missing"] = _answer(lambda a: a.value, report.pain)
        row["findings"], row["findings_missing"] = _answer(lambda a: [f.value for f in a.value], report.new_findings)
        att = report.attention
        row["attention_prompt_id"] = att.prompt_id
        if isinstance(att, AttentionAnswered):
            row["attention_count"] = att.count
        else:
            row["attention_missing"] = att.reason.value
        row["items"] = json.dumps(
            {k: v.model_dump(mode="json") for k, v in report.items.items()}, sort_keys=True
        )
    elif isinstance(report, FindingReport):
        row["findings"] = [f.value for f in report.findings]
    elif report.kind == "concern":
        row["concern"] = report.concern.value
    return row


INSERT_REPORT = """
    INSERT INTO report (
        id, visit_id, captured_at, kind, reporter, channel, session_id, questionnaire_version,
        feeling_now, feeling_now_missing, feeling_change, feeling_change_missing,
        pain, pain_missing, findings, findings_missing,
        attention_prompt_id, attention_count, attention_missing, items, concern
    ) VALUES (
        %(id)s, %(visit_id)s, %(captured_at)s, %(kind)s, %(reporter)s, %(channel)s, %(session_id)s,
        %(questionnaire_version)s, %(feeling_now)s, %(feeling_now_missing)s, %(feeling_change)s,
        %(feeling_change_missing)s, %(pain)s, %(pain_missing)s, %(findings)s::finding_code[],
        %(findings_missing)s, %(attention_prompt_id)s, %(attention_count)s, %(attention_missing)s,
        %(items)s::jsonb, %(concern)s
    )
    RETURNING received_at
"""


async def score_attention(conn, visit_id: UUID, report: CheckinReport) -> AttentionResult | None:
    """Score the circle check against the prompt the server issued. None when no prompt was shown."""
    prompt_id = report.attention.prompt_id
    if prompt_id is None:
        return None
    cur = await conn.execute(
        "SELECT expected_count, expires_at FROM attention_prompt WHERE id = %s AND visit_id = %s",
        [prompt_id, visit_id],
    )
    row = await cur.fetchone()
    if row is None:
        raise _unprocessable("attention prompt not found for this visit")
    expected, expires_at = row
    if report.captured_at > expires_at:
        raise _unprocessable("attention prompt expired before it was answered")
    cur = await conn.execute("SELECT 1 FROM report WHERE attention_prompt_id = %s LIMIT 1", [prompt_id])
    if await cur.fetchone() is not None:
        raise _unprocessable("attention prompt was already answered")
    try:
        return score(prompt_id, expected, report.attention)
    except PromptMismatch as e:
        raise _unprocessable(str(e)) from None


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post(
    "/reports",
    response_model=ReportReceipt,
    responses={
        401: {"description": "Not signed in, or this device was signed out"},
        409: {"description": "submission_id reused for a different report"},
        422: {"description": "Reporter, channel, question bank or attention prompt doesn't match"},
    },
)
async def post_report(
    report: PatientReport,
    session: Annotated[VisitSession, Depends(current_visit_session)],
    pool: Pool,
) -> ReportReceipt:
    """Store a report, route anything urgent, and say what to show and ask next."""
    if report.reporter != session.role:
        raise _unprocessable("reporter must match the role chosen at sign-in")
    if report.channel is not Channel.PHONE:
        raise _unprocessable("reports come from the signed-in phone (channel: phone)")
    bank = default_bank()
    if isinstance(report, CheckinReport):
        check_items(bank, report)

    fp = submissions.fingerprint(report)
    async with write_tx(pool, session.actor) as conn:
        # One report at a time per visit, so two can't both open a task.
        cur = await conn.execute(
            "SELECT complaint_group, cedis_code, app_exclusion FROM visit WHERE id = %s FOR UPDATE",
            [session.visit_id],
        )
        complaint_group, cedis_code, app_exclusion = await cur.fetchone()
        visit = {"complaint_group": complaint_group, "cedis_code": cedis_code}

        previous = await submissions.find(conn, report.submission_id, actor=session.actor, endpoint=ENDPOINT, fp=fp)
        if previous is not None:
            cur = await conn.execute(
                "SELECT received_at FROM report WHERE id = %s AND visit_id = %s", [report.submission_id, session.visit_id]
            )
            (received_at,) = await cur.fetchone()
            return _receipt(report, received_at, bank, visit, attention=None, duplicate=True)

        attention = await score_attention(conn, session.visit_id, report) if isinstance(report, CheckinReport) else None

        cur = await conn.execute(INSERT_REPORT, report_row(report, session))
        (received_at,) = await cur.fetchone()
        await submissions.record(
            conn, report.submission_id, actor=session.actor, endpoint=ENDPOINT, fp=fp, visit_id=session.visit_id
        )
        if isinstance(report, CheckinReport) and app_exclusion is None:
            # The patient prompt timer restarts. The staff reassessment timer never moves for a report.
            await conn.execute(
                "UPDATE visit SET next_prompt_due_at = now() + ctas_interval(ctas) WHERE id = %s", [session.visit_id]
            )
        fires = rules.evaluate(report, attention, _group(complaint_group))
        task_id = await tasks.raise_task(
            conn, session.visit_id, fires, [{"kind": "report", "id": str(report.submission_id)}]
        )
        await events.notify(conn, DashboardEventType.REPORT_RECEIVED, session.visit_id)
        if task_id is not None:
            await events.notify(conn, DashboardEventType.TASK_CHANGED, session.visit_id, task_id)
    return _receipt(report, received_at, bank, visit, attention=attention, duplicate=False)


def _group(value: str | None) -> ComplaintGroup | None:
    return ComplaintGroup(value) if value else None


def _receipt(report, received_at: datetime, bank, visit, *, attention, duplicate: bool) -> ReportReceipt:
    fires = rules.evaluate(report, attention, _group(visit["complaint_group"]))
    return ReportReceipt(
        submission_id=report.submission_id,
        received_at=received_at,
        duplicate=duplicate,
        patient_message=rules.patient_message(report, fires),
        follow_up_items=follow_up_items(bank, visit, report),
    )
