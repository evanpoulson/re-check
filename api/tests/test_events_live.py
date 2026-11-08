"""Notices through real Postgres. A bare pg_notify writes no rows, so demo data is untouched."""

import asyncio

import pytest
from psycopg import AsyncConnection

from recheck import events
from recheck.contract.codes import DashboardEventType
from recheck.events import Broker

from conftest import LIVE_URL
from test_reports_live import checkin, post, query, sid, sign_in

pytestmark = pytest.mark.live


def test_notice_reaches_a_subscriber_through_postgres():
    if LIVE_URL is None:
        pytest.skip("RECHECK_DATABASE_URL not set")

    async def go():
        async with await AsyncConnection.connect(LIVE_URL, autocommit=True) as conn:
            cur = await conn.execute(
                "SELECT id, site_id FROM visit WHERE status = 'waiting' ORDER BY triaged_at LIMIT 1"
            )
            visit_id, site_id = await cur.fetchone()
        broker = Broker()
        queue = broker.subscribe(site_id)
        listener = asyncio.create_task(broker.listen(LIVE_URL))
        try:
            await asyncio.sleep(1.0)  # let LISTEN start
            async with await AsyncConnection.connect(LIVE_URL, autocommit=True) as conn:
                await events.notify(conn, DashboardEventType.VITALS_RECORDED, visit_id)
            got = await asyncio.wait_for(queue.get(), 10)
        finally:
            await events.stop(listener)
        return visit_id, got

    visit_id, got = asyncio.run(go(), loop_factory=asyncio.SelectorEventLoop)
    assert got.visit_id == visit_id and got.type is DashboardEventType.VITALS_RECORDED and got.task_id is None


def test_writes_send_notices(live_client, monkeypatch):
    sent = []
    real = events.notify

    async def record(conn, type, visit_id, task_id=None):
        sent.append((type, str(visit_id), task_id is not None))
        await real(conn, type, visit_id, task_id)

    monkeypatch.setattr(events, "notify", record)

    visit = sign_in(live_client)  # enrol + sign-in
    post(live_client, checkin(change="much_worse"))
    task = query(live_client, "SELECT id::text FROM task WHERE visit_id = %s", visit)[0]
    live_client.post("/api/staff/session", json={"role": "physician"})
    live_client.post(f"/api/tasks/{task}/acknowledge", json={"submission_id": sid()})

    assert sent == [
        (DashboardEventType.VISIT_CHANGED, visit, False),   # enrolled
        (DashboardEventType.VISIT_CHANGED, visit, False),   # phone signed in
        (DashboardEventType.REPORT_RECEIVED, visit, False),
        (DashboardEventType.TASK_CHANGED, visit, True),
        (DashboardEventType.TASK_CHANGED, visit, True),     # acknowledged
    ]


def test_retries_send_no_extra_notices(live_client, monkeypatch):
    visit = sign_in(live_client)
    body = checkin(change="worse")
    post(live_client, body)
    sent = []

    async def record(conn, type, visit_id, task_id=None):
        sent.append(type)

    monkeypatch.setattr(events, "notify", record)
    assert post(live_client, body).json()["duplicate"] is True
    assert sent == []
