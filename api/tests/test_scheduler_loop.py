"""The timer loop keeps going through database errors and stops cleanly. No database needed."""

import asyncio
from contextlib import asynccontextmanager

from fastapi.testclient import TestClient

from recheck import main, scheduler
from recheck.main import create_app

from test_health import FakePool


class BrokenPool:
    def __init__(self):
        self.attempts = 0

    @asynccontextmanager
    async def connection(self, timeout=None):
        self.attempts += 1
        raise OSError("database unreachable")
        yield


def test_loop_survives_errors_and_cancels_cleanly():
    async def go():
        pool = BrokenPool()
        task = asyncio.create_task(scheduler.run_forever(pool, 0.01))
        await asyncio.sleep(0.08)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        return pool.attempts

    assert asyncio.run(go(), loop_factory=asyncio.SelectorEventLoop) >= 2


def test_timers_dont_start_when_a_test_pool_is_passed(monkeypatch):
    started = []

    async def fake_run_forever(pool, every):
        started.append(every)

    monkeypatch.setattr(main.scheduler, "run_forever", fake_run_forever)
    with TestClient(create_app(FakePool())) as client:
        assert client.get("/api/health").status_code == 200
    assert started == []


def test_a_failing_reminder_round_does_not_stop_the_timers():
    class FailingSender:
        def __init__(self):
            self.rounds = 0

        async def run_round(self, pool):
            self.rounds += 1
            raise OSError("push service unreachable")

    async def go():
        pool, sender = BrokenPool(), FailingSender()
        task = asyncio.create_task(scheduler.run_forever(pool, 0.01, sender))
        await asyncio.sleep(0.08)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        return pool.attempts, sender.rounds

    attempts, rounds = asyncio.run(go(), loop_factory=asyncio.SelectorEventLoop)
    assert attempts >= 2 and rounds >= 2
