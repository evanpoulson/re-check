"""Server-side timers, run every few seconds inside the API process.

- Missed check-in: a waiting app visit whose patient prompt is SILENT_AFTER
  overdue gets a "silent" reason (`missed_checkin`) on its task, once per due
  time. The prompt timer isn't moved; the patient answering restarts it.
- Escalation: a red task still unacknowledged past its deadline is marked
  escalated and routed to the charge nurse as backup.

Both match the synthetic cohort (synthetic/cohort.py missed_check, escalate).
Escalate-only, like everything else: nothing here lowers a level, removes a
recipient or closes a task. A transaction-scoped advisory lock means only one
API process runs a round at a time.
"""

import asyncio
import logging
from dataclasses import dataclass

from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool

from . import events, tasks
from .contract.codes import DashboardEventType, TaskLevel
from .db import write_tx
from .rules import Fire
from .views import SILENT_AFTER

log = logging.getLogger(__name__)

ACTOR = "system|scheduler"
LOCK_KEY = 0x7265636865636B  # "recheck"; any app-wide constant
MISSED_CHECKIN = Fire(TaskLevel.SILENT, "missed_checkin")


@dataclass(frozen=True)
class Round:
    ran: bool
    missed: int = 0
    escalated: int = 0


async def run_checks(conn: AsyncConnection) -> Round:
    """One round of timer checks inside the caller's write transaction (app.actor already set)."""
    cur = await conn.execute("SELECT pg_try_advisory_xact_lock(%s)", [LOCK_KEY])
    if not (await cur.fetchone())[0]:
        return Round(ran=False)

    # Missed check-ins: once per due time, so a later round doesn't add the same reason again.
    cur = await conn.execute(
        """
        SELECT v.id,
               (SELECT r.id FROM report r WHERE r.visit_id = v.id ORDER BY r.received_at DESC LIMIT 1)
        FROM visit v
        WHERE v.status = 'waiting' AND v.app_exclusion IS NULL
          AND v.next_prompt_due_at <= now() - %s
          AND NOT EXISTS (
              SELECT 1 FROM task_reason tr JOIN task t ON t.id = tr.task_id
              WHERE t.visit_id = v.id AND tr.reason_code = %s AND tr.fired_at >= v.next_prompt_due_at
          )
        FOR UPDATE OF v SKIP LOCKED
        """,
        [SILENT_AFTER, MISSED_CHECKIN.reason_code],
    )
    missed = await cur.fetchall()
    for visit_id, last_report in missed:
        evidence = [{"kind": "report", "id": str(last_report)}] if last_report else []
        task_id = await tasks.raise_task(conn, visit_id, [MISSED_CHECKIN], evidence)
        await events.notify(conn, DashboardEventType.TASK_CHANGED, visit_id, task_id)

    # Unacknowledged reds past their deadline go to the charge nurse too.
    cur = await conn.execute(
        """
        UPDATE task t SET
            escalated = true,
            routed_to = ARRAY(SELECT DISTINCT unnest(t.routed_to || ARRAY['charge_nurse'::staff_role]) ORDER BY 1)
        FROM visit v
        WHERE v.id = t.visit_id AND v.status = 'waiting'
          AND t.level = 'red' AND t.status = 'open' AND NOT t.escalated AND t.ack_due_at <= now()
        RETURNING t.id, t.visit_id
        """
    )
    escalated = await cur.fetchall()
    for task_id, visit_id in escalated:
        await events.notify(conn, DashboardEventType.TASK_CHANGED, visit_id, task_id)
    return Round(ran=True, missed=len(missed), escalated=len(escalated))


async def run_forever(pool: AsyncConnectionPool, every_seconds: float) -> None:
    """Background loop started with the app. Errors are logged and the loop keeps going."""
    while True:
        try:
            async with write_tx(pool, ACTOR) as conn:
                result = await run_checks(conn)
            if result.missed or result.escalated:
                log.info("timers: %d missed check-ins, %d escalations", result.missed, result.escalated)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("timer round failed")
        await asyncio.sleep(every_seconds)
