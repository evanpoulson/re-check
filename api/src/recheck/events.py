"""Live dashboard notices: "something changed on visit X".

A write calls `notify()` inside its transaction. Postgres delivers the
notification only if that transaction commits, so a notice never describes a
change that was rolled back. One `Broker` per API process LISTENs on the
channel and hands each notice to every connected staff screen at that site;
the screen refetches the view it shows (contract/events.py: notices are change
signals, so a missed one can't leave a screen permanently wrong).
"""

import asyncio
import json
import logging
from contextlib import suppress
from uuid import UUID

from psycopg import AsyncConnection

from .contract.codes import DashboardEventType
from .contract.events import DashboardEvent

log = logging.getLogger(__name__)

CHANNEL = "recheck_events"
QUEUE_SIZE = 100


async def notify(conn: AsyncConnection, type: DashboardEventType, visit_id: UUID, task_id: UUID | None = None) -> None:
    """Queue a notice for the visit's site; Postgres sends it when the transaction commits."""
    await conn.execute(
        """
        SELECT pg_notify(%s, json_build_object(
            'site_id', v.site_id, 'event_id', gen_random_uuid(), 'type', %s::text,
            'at', now(), 'visit_id', v.id, 'task_id', %s::uuid
        )::text)
        FROM visit v WHERE v.id = %s
        """,
        [CHANNEL, type.value, task_id, visit_id],
    )


class Broker:
    """Fans notices out to subscribers, filtered by site."""

    def __init__(self) -> None:
        self._subscribers: dict[asyncio.Queue, str] = {}

    def subscribe(self, site_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._subscribers[queue] = site_id
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.pop(queue, None)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def publish(self, site_id: str, event: DashboardEvent) -> None:
        for queue, site in list(self._subscribers.items()):
            if site != site_id:
                continue
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # A screen that stopped reading; it refetches on reconnect, so dropping is safe.
                log.warning("dropping a dashboard notice for a slow subscriber")

    def publish_payload(self, payload: str) -> None:
        data = json.loads(payload)
        site_id = data.pop("site_id")
        self.publish(site_id, DashboardEvent.model_validate(data))

    async def listen(self, database_url: str, retry_seconds: float = 2.0) -> None:
        """LISTEN forever on a dedicated connection, reconnecting after errors."""
        while True:
            try:
                async with await AsyncConnection.connect(database_url, autocommit=True) as conn:
                    await conn.execute(f"LISTEN {CHANNEL}")
                    log.info("listening for dashboard notices")
                    async for note in conn.notifies():
                        try:
                            self.publish_payload(note.payload)
                        except Exception:
                            log.exception("bad dashboard notice: %s", note.payload)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("dashboard notice listener lost its connection; retrying")
            await asyncio.sleep(retry_seconds)


async def stop(task: asyncio.Task | None) -> None:
    if task is not None:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
