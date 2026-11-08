"""Reseed a small, calm demo board. Run between demos.

    uv run python -m recheck.synthetic.reseed            # uses RECHECK_DATABASE_URL from the root .env
    uv run python -m recheck.synthetic.reseed --dry-run  # show what would load

In one transaction as `recheck_app`, with `app.actor = 'seed|synthetic-cohort'`:

1. Every visit still waiting at the site is discharged. Rows can't be deleted,
   so earlier demos stay in the history, off the board.
2. A new batch (named from the clock) loads nine visits: the scripted demo
   cases, one staff-watched visit without the app, and two quiet generated
   visits.
3. Check-ins and staff reassessments are pushed one to three hours out,
   staggered, so the board stays quiet through a demo. Only the two cases that
   are meant to be silent (`head_injury_unanswered`, `pager_silent`) stay
   overdue. Open tasks get at least `--ack-minutes` to acknowledge, so the red
   chest-pain task doesn't escalate before anyone has looked at it.

QR tokens are encrypted with RECHECK_SECRET_KEY, so the desk can show each QR
again; the key must match the API's. The raw links also go to
`.seed-tokens.json` at the repository root (git-ignored).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .cohort import SITE_ID, Cohort, build_cohort
from .load import ACTOR, _summary, insert_cohort

SCRIPTED = (
    "chest_worsening",
    "companion_speech_live",
    "head_injury_unanswered",
    "leave_intent",
    "pager_silent",
    "desk_question",
    "excluded_self_harm",
)
# Left overdue on purpose: the board should show a couple of silent visits.
MEANT_SILENT = {"head_injury_unanswered", "pager_silent"}
GENERATED = 2
ROOT = Path(__file__).resolve().parents[4]


def demo_cohort(anchor: datetime, batch: str, *, quiet_from: int, quiet_to: int, ack_minutes: int) -> Cohort:
    """The full cohort cut to a small board, with timers pushed out so it stays calm."""
    cohort = build_cohort(anchor, batch=batch)
    by_name = {v.scenario: v for v in cohort.visits}
    generated = [
        v for v in cohort.visits
        if v.scenario.startswith("generated_") and v.status == "waiting" and v.open_task is None
        and v.app_exclusion is None
    ][:GENERATED]
    cohort.visits[:] = [by_name[s] for s in SCRIPTED] + generated

    quiet = [v for v in cohort.visits if v.scenario not in MEANT_SILENT]
    step = (quiet_to - quiet_from) / max(len(quiet) - 1, 1)
    for i, v in enumerate(quiet):
        due = anchor + timedelta(minutes=quiet_from + i * step)
        if v.app_exclusion is None:
            v.next_prompt_due_at = due
        # Stagger the staff timer the other way, so prompts and reassessments don't land together.
        v.staff_reassess_due_at = anchor + timedelta(minutes=quiet_to - i * step)

    floor = anchor + timedelta(minutes=ack_minutes)
    for v in cohort.visits:
        task = v.open_task
        if task is not None and task.acknowledged_at is None and task.ack_due_at < floor:
            task.ack_due_at = floor
    return cohort


def main(argv: list[str] | None = None) -> None:
    from .. import settings

    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--batch", help="batch name (default: demo-<UTC time>)")
    parser.add_argument("--quiet-from", type=int, default=60, help="first check-in due, minutes from now")
    parser.add_argument("--quiet-to", type=int, default=180, help="last check-in due, minutes from now")
    parser.add_argument("--ack-minutes", type=int, default=15, help="least time to acknowledge a seeded task")
    parser.add_argument("--tokens-out", type=Path, default=ROOT / ".seed-tokens.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    anchor = datetime.now(UTC)
    batch = args.batch or f"demo-{anchor:%Y%m%d-%H%M%S}"
    cohort = demo_cohort(anchor, batch, quiet_from=args.quiet_from, quiet_to=args.quiet_to,
                         ack_minutes=args.ack_minutes)
    for v in cohort.visits:
        due = v.next_prompt_due_at
        task = v.open_task
        print(f"  {v.scenario:24} CTAS {v.ctas}  check-in "
              f"{f'in {(due - anchor) / timedelta(minutes=1):.0f} min' if due else '—':>12}"
              f"  task {task.level if task else '—'}")
    if args.dry_run:
        print(_summary(cohort))
        return

    import psycopg

    from ..security import encrypt_token

    url = args.database_url or settings.database_url()
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("SET LOCAL ROLE recheck_app")
        cur.execute("SELECT set_config('app.actor', %s, true)", (ACTOR,))
        cur.execute(
            "UPDATE visit SET status = 'discharged', closed_at = now() WHERE site_id = %s AND status = 'waiting'",
            (SITE_ID,),
        )
        discharged = cur.rowcount
        tokens = insert_cohort(cur, cohort, encrypt_token)

    args.tokens_out.write_text(json.dumps({k: f"/v/{t}" for k, t in tokens.items()}, indent=2))
    os.chmod(args.tokens_out, 0o600)
    print(f"discharged {discharged} waiting visits")
    print(_summary(cohort))
    print(f"loaded batch {batch!r}; QR links in {args.tokens_out}")


if __name__ == "__main__":
    sys.exit(main())
