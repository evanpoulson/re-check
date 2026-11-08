"""Live dashboard notices: broker, SSE stream and route. No database needed."""

import asyncio
import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from recheck.contract.codes import DashboardEventType
from recheck.contract.events import DashboardEvent
from recheck.events import QUEUE_SIZE, Broker
from recheck.main import create_app
from recheck.routes.events import event_stream

from test_health import FakePool


def event(visit=None, task=None) -> DashboardEvent:
    return DashboardEvent(event_id=uuid4(), type=DashboardEventType.TASK_CHANGED, at=datetime.now(UTC),
                          visit_id=visit or uuid4(), task_id=task)


def run(coro):
    return asyncio.run(coro, loop_factory=asyncio.SelectorEventLoop)


def test_broker_sends_only_to_the_same_site():
    async def go():
        broker = Broker()
        mine, other = broker.subscribe("foothills-demo"), broker.subscribe("rockyview")
        e = event()
        broker.publish("foothills-demo", e)
        assert mine.get_nowait() == e
        assert other.empty()
        broker.unsubscribe(mine)
        broker.unsubscribe(other)
        assert broker.subscriber_count == 0

    run(go())


def test_broker_parses_the_database_payload():
    async def go():
        broker = Broker()
        queue = broker.subscribe("foothills-demo")
        visit, task = uuid4(), uuid4()
        payload = json.dumps({"site_id": "foothills-demo", "event_id": str(uuid4()), "type": "task.changed",
                              "at": "2026-11-08T04:00:00+00:00", "visit_id": str(visit), "task_id": str(task)})
        broker.publish_payload(payload)
        got = queue.get_nowait()
        assert (got.visit_id, got.task_id, got.type) == (visit, task, DashboardEventType.TASK_CHANGED)

    run(go())


def test_a_slow_screen_is_dropped_not_blocking():
    async def go():
        broker = Broker()
        slow, fast = broker.subscribe("s"), broker.subscribe("s")
        for _ in range(QUEUE_SIZE + 5):
            broker.publish("s", event())
            fast.get_nowait()
        assert slow.qsize() == QUEUE_SIZE

    run(go())


class FakeRequest:
    def __init__(self, disconnect_after: int):
        self.calls = 0
        self.disconnect_after = disconnect_after

    async def is_disconnected(self):
        self.calls += 1
        return self.calls > self.disconnect_after


def test_stream_sends_retry_heartbeat_events_and_unsubscribes():
    async def go():
        broker = Broker()
        queue = broker.subscribe("s")
        e = event()
        frames = []
        stream = event_stream(FakeRequest(disconnect_after=2), broker, queue, heartbeat=0.01)
        async for frame in stream:
            frames.append(frame)
            if len(frames) == 2:
                broker.publish("s", e)
        return frames, broker.subscriber_count, e

    frames, subscribers, e = run(go())
    assert frames[0].startswith("retry: ")
    assert frames[1] == ": keep-alive\n\n"
    assert frames[2] == f"id: {e.event_id}\ndata: {e.model_dump_json()}\n\n"
    assert subscribers == 0, "a closed stream unsubscribes"


def test_events_need_staff_sign_in():
    with TestClient(create_app(FakePool())) as client:
        assert client.get("/api/events").status_code == 401
        spec = client.get("/openapi.json").json()
    assert "text/event-stream" in spec["paths"]["/api/events"]["get"]["responses"]["200"]["content"]
