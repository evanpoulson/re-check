"""Apply rule firings to the visit's one active task.

Opens a task if none is active, otherwise raises it: the level only goes up,
recipients are only added, and an unacknowledged deadline only moves earlier.
Each firing is kept as a task_reason with its evidence and ruleset version.
The database enforces the same rules (task_escalate_only), so a bug here fails
loudly instead of lowering anyone's priority.

Call inside a write transaction that already holds the visit row lock, so two
reports for the same visit can't both open a task.
"""

import json
from uuid import UUID

from psycopg import AsyncConnection

from .rules import ACK_DUE, RULESET_VERSION, Fire, highest


async def raise_task(conn: AsyncConnection, visit_id: UUID, fires: list[Fire], evidence: list[dict]) -> UUID | None:
    """Returns the task ID, or None when nothing fired."""
    if not fires:
        return None
    level = highest(f.level for f in fires)
    routed = sorted({r.value for f in fires for r in f.routed_to})
    due_after = min(ACK_DUE[f.level] for f in fires)

    cur = await conn.execute(
        "SELECT id FROM task WHERE visit_id = %s AND status <> 'completed' FOR UPDATE", [visit_id]
    )
    row = await cur.fetchone()
    if row is None:
        cur = await conn.execute(
            """
            INSERT INTO task (visit_id, level, routed_to, ack_due_at)
            VALUES (%s, %s, %s::staff_role[], now() + %s)
            RETURNING id
            """,
            [visit_id, level.value, routed, due_after],
        )
        (task_id,) = await cur.fetchone()
    else:
        (task_id,) = row
        await conn.execute(
            """
            UPDATE task SET
                level = greatest(level, %s::task_level),
                routed_to = ARRAY(SELECT DISTINCT unnest(routed_to || %s::staff_role[]) ORDER BY 1),
                ack_due_at = CASE
                    WHEN acknowledged_at IS NOT NULL THEN ack_due_at
                    ELSE least(ack_due_at, now() + %s)
                END
            WHERE id = %s
            """,
            [level.value, routed, due_after, task_id],
        )

    for fire in fires:
        await conn.execute(
            """
            INSERT INTO task_reason (task_id, rule_id, rule_version, level, reason_code, evidence)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            """,
            [task_id, fire.rule_id, RULESET_VERSION, fire.level.value, fire.reason_code, json.dumps(evidence)],
        )
    return task_id
