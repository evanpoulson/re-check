"""Load the synthetic cohort into the Recheck database.

    uv run python -m recheck.synthetic.load                      # uses RECHECK_DATABASE_URL
    uv run python -m recheck.synthetic.load --dry-run --json cohort.json
    uv run python -m recheck.synthetic.load --batch demo-2 --tokens-out .seed-tokens.json

Writes run in one transaction as the `recheck_app` role, with
`app.actor = 'seed|synthetic-cohort'`. Rows can't be deleted, so a batch
loads once. To refresh the demo, load a new batch name; the IDs are derived
from the batch, so the same batch name always gives the same IDs.

QR tokens are random for each load. The database keeps only their SHA-256 hash
and a placeholder in `token_ciphertext`: the API's encryption isn't built yet,
so the desk can't re-show these QRs. `--tokens-out` writes the raw tokens to a
local file for the demo, which must stay out of Git.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import sys
from datetime import UTC, datetime
from pathlib import Path
from collections.abc import Callable
from typing import Any

from .cohort import SITE_ID, Cohort, Report, Visit, build_cohort

ACTOR = "seed|synthetic-cohort"


def _fingerprint(report: Report) -> bytes:
    body = {k: v for k, v in vars(report).items() if k not in ("received_at",)}
    return hashlib.sha256(json.dumps(body, default=str, sort_keys=True).encode()).digest()


def _insert_report(cur: Any, v: Visit, r: Report) -> None:
    from psycopg.types.json import Jsonb

    cur.execute(
        "INSERT INTO submission (id, actor, endpoint, fingerprint, visit_id, received_at)"
        " VALUES (%s, %s, 'seed', %s, %s, %s)",
        (r.id, ACTOR, _fingerprint(r), v.id, r.received_at),
    )
    cur.execute(
        """
        INSERT INTO report (
            id, visit_id, received_at, captured_at, kind, reporter, channel, questionnaire_version,
            feeling_now, feeling_now_missing, feeling_change, feeling_change_missing,
            pain, pain_missing, findings, findings_missing,
            attention_prompt_id, attention_count, attention_missing,
            items, concern, session_id, note, entered_by
        ) VALUES (
            %s, %s, %s, %s, %s::report_kind, %s::reporter, %s::channel, %s,
            %s::feeling_now, %s::missing_reason, %s::feeling_change, %s::missing_reason,
            %s, %s::missing_reason, %s::finding_code[], %s::missing_reason,
            %s, %s, %s::missing_reason,
            %s, %s::concern_code, %s, %s, %s
        )
        """,
        (
            r.id, v.id, r.received_at, r.captured_at, r.kind, r.reporter, r.channel, r.questionnaire_version,
            r.feeling_now, r.feeling_now_missing, r.feeling_change, r.feeling_change_missing,
            r.pain, r.pain_missing, r.findings, r.findings_missing,
            r.attention_prompt_id, r.attention_count, r.attention_missing,
            Jsonb(r.items), r.concern, r.session_id, r.note, r.entered_by,
        ),
    )


def _insert_visit(cur: Any, v: Visit, token: str | None, ciphertext: bytes | None = None) -> None:
    from psycopg.types.json import Jsonb

    app = v.app_exclusion is None
    cur.execute(
        """
        INSERT INTO visit (
            id, site_id, ctas, complaint_group, cedis_code, language, app_exclusion, channel, pager_no,
            token_hash, token_ciphertext, triaged_at, next_prompt_due_at, staff_reassess_due_at, last_staff_check_at
        ) VALUES (
            %s, %s, %s, %s::complaint_group, %s, %s, %s::app_exclusion, %s::channel, %s,
            %s, %s, %s, %s, %s, %s
        )
        """,
        (
            v.id, SITE_ID, v.ctas, v.complaint_group, v.cedis_code, v.language, v.app_exclusion, v.channel, v.pager_no,
            hashlib.sha256(token.encode()).digest() if app and token else None,
            (ciphertext or os.urandom(48)) if app else None,
            v.triaged_at, v.next_prompt_due_at if app else None, v.staff_reassess_due_at, v.last_staff_check_at,
        ),
    )

    for p in v.prompts:
        cur.execute(
            "INSERT INTO attention_prompt (id, visit_id, questionnaire_version, issued_at, expires_at, steps,"
            " show_ms, gap_ms, expected_count) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (p.id, v.id, p.questionnaire_version, p.issued_at, p.expires_at, Jsonb(p.steps), p.show_ms, p.gap_ms,
             p.expected_count),
        )

    # Sessions in order, each with its reports while it is open (a signed-out device can't report).
    by_session: dict[Any, list[Report]] = {}
    for r in v.reports:
        by_session.setdefault(r.session_id, []).append(r)
    for s in sorted(v.sessions, key=lambda s: s.created_at):
        cur.execute(
            "INSERT INTO visit_session (id, visit_id, role, session_hash, created_at, replaces)"
            " VALUES (%s, %s, %s::reporter, %s, %s, %s)",
            (s.id, v.id, s.role, hashlib.sha256(secrets.token_bytes(32)).digest(), s.created_at, s.replaces),
        )
        for r in by_session.pop(s.id, []):
            _insert_report(cur, v, r)
        if s.revoked_at is not None:
            cur.execute(
                "UPDATE visit_session SET revoked_at = %s, revoked_reason = %s::session_end_reason WHERE id = %s",
                (s.revoked_at, s.revoked_reason, s.id),
            )
    for r in by_session.pop(None, []):
        _insert_report(cur, v, r)
    if by_session:
        raise RuntimeError(f"visit {v.scenario} has reports for unknown sessions")

    for m in v.vitals:
        cur.execute(
            "INSERT INTO vitals (id, visit_id, measured_at, received_at, sbp, dbp, hr, rr, spo2, temp_c,"
            " entered_by, entered_by_role) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::staff_role)",
            (m.id, v.id, m.measured_at, m.received_at, m.sbp, m.dbp, m.hr, m.rr, m.spo2, m.temp_c, m.entered_by,
             m.entered_by_role),
        )

    for t in v.tasks:
        cur.execute(
            """
            INSERT INTO task (
                id, visit_id, level, status, escalated, routed_to, created_at, ack_due_at, delivered_at,
                acknowledged_at, acknowledged_by, acknowledged_by_role,
                assessed_at, assessed_by, assessed_by_role, disposition
            ) VALUES (
                %s, %s, %s::task_level, %s::task_status, %s, %s::staff_role[], %s, %s, %s,
                %s, %s, %s::staff_role, %s, %s, %s::staff_role, %s::disposition
            )
            """,
            (
                t.id, v.id, t.level, t.status, t.escalated, t.routed_to, t.created_at, t.ack_due_at, t.delivered_at,
                t.acknowledged_at, t.acknowledged_by, t.acknowledged_by_role,
                t.assessed_at, t.assessed_by, t.assessed_by_role, t.disposition,
            ),
        )
        for reason in t.reasons:
            cur.execute(
                "INSERT INTO task_reason (id, task_id, rule_id, rule_version, level, reason_code, evidence, fired_at)"
                " VALUES (%s, %s, %s, %s, %s::task_level, %s, %s, %s)",
                (reason.id, t.id, reason.rule_id, reason.rule_version, reason.level, reason.reason_code,
                 Jsonb(reason.evidence), reason.fired_at),
            )

    if v.status != "waiting":
        cur.execute(
            "UPDATE visit SET status = %s::visit_status, closed_at = %s WHERE id = %s",
            (v.status, v.closed_at, v.id),
        )


def load(cohort: Cohort, database_url: str) -> dict[str, str]:
    """Insert the cohort in one transaction. Returns the raw QR token for each app visit, by scenario."""
    import psycopg

    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute("SET LOCAL ROLE recheck_app")
        cur.execute("SELECT set_config('app.actor', %s, true)", (ACTOR,))
        return insert_cohort(cur, cohort)


def insert_cohort(cur: Any, cohort: Cohort, encrypt: Callable[[str], bytes] | None = None) -> dict[str, str]:
    """Insert the cohort with an open cursor (role and app.actor already set). Returns raw QR tokens by scenario.

    `encrypt` stores a real token ciphertext, so the desk can re-show the QR; without it, a placeholder.
    """
    tokens = {v.scenario: secrets.token_urlsafe(32) for v in cohort.visits if v.app_exclusion is None}
    cur.execute("SELECT count(*) FROM visit WHERE id = ANY(%s)", ([v.id for v in cohort.visits],))
    (existing,) = cur.fetchone()
    if existing:
        raise SystemExit(
            f"batch {cohort.batch!r} is already loaded ({existing} visits). Rows can't be deleted;"
            " load a new batch name, such as --batch demo-2."
        )
    for v in cohort.visits:
        token = tokens.get(v.scenario)
        _insert_visit(cur, v, token, encrypt(token) if encrypt and token else None)
    return tokens


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--database-url", default=os.environ.get("RECHECK_DATABASE_URL"))
    parser.add_argument("--anchor", help="ISO time the cohort is built around (default: now)")
    parser.add_argument("--seed", type=int, default=20261108)
    parser.add_argument("--batch", default="demo-1")
    parser.add_argument("--json", type=Path, help="also write the cohort as JSON")
    parser.add_argument("--tokens-out", type=Path, help="write raw QR tokens here (keep out of Git)")
    parser.add_argument("--dry-run", action="store_true", help="build the cohort without touching the database")
    args = parser.parse_args(argv)

    anchor = datetime.fromisoformat(args.anchor) if args.anchor else datetime.now(UTC)
    cohort = build_cohort(anchor, seed=args.seed, batch=args.batch)
    if args.json:
        args.json.write_text(json.dumps(cohort.to_json(), indent=2))
    summary = _summary(cohort)
    if args.dry_run:
        print(summary)
        return
    if not args.database_url:
        sys.exit("set RECHECK_DATABASE_URL or pass --database-url")
    tokens = load(cohort, args.database_url)
    if args.tokens_out:
        args.tokens_out.write_text(json.dumps({k: f"/v/{t}" for k, t in tokens.items()}, indent=2))
        args.tokens_out.chmod(0o600)
    print(summary)
    print(f"loaded batch {cohort.batch!r} as {ACTOR}")


def _summary(cohort: Cohort) -> str:
    from collections import Counter

    v = cohort.visits
    status = Counter(x.status for x in v)
    open_levels = Counter(x.open_task.level for x in v if x.open_task)
    expected = sum(x.profile["leave_probability"] for x in v)
    return (
        f"{len(v)} visits at {SITE_ID} around {cohort.anchor.isoformat(timespec='minutes')}: "
        f"{dict(status)}; open tasks {dict(open_levels)}; "
        f"expected leavers {expected:.1f}, actual {status.get('left', 0)}"
    )


if __name__ == "__main__":
    main()
