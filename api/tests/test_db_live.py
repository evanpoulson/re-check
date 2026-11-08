"""Checks against the real database in RECHECK_DATABASE_URL. Skipped when it isn't set.

Nothing here writes: transactions are rolled back.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

from recheck.db import make_pool, write_tx
from recheck.main import create_app
from recheck.settings import database_url

try:
    URL = database_url()
except RuntimeError:
    URL = None

BACKEND = {"loop_factory": asyncio.SelectorEventLoop}

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(URL is None, reason="RECHECK_DATABASE_URL not set"),
]


def test_health_against_real_database():
    with TestClient(create_app(make_pool(URL)), backend_options=BACKEND) as client:
        response = client.get("/api/health")
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "ok", "database": "ok"}


def test_write_tx_sets_actor_and_uses_app_role():
    class Rollback(Exception):
        pass

    async def check():
        pool = make_pool(URL)
        await pool.open(wait=True, timeout=10)
        try:
            try:
                async with write_tx(pool, "test|live-check") as conn:
                    cur = await conn.execute(
                        "SELECT current_setting('app.actor'), current_user, "
                        "pg_has_role(current_user, 'recheck_app', 'MEMBER')"
                    )
                    actor, user, is_app = await cur.fetchone()
                    raise Rollback
            except Rollback:
                pass
            # The setting is transaction-local: a later use of the pool doesn't see it.
            async with pool.connection() as conn:
                cur = await conn.execute("SELECT current_setting('app.actor', true)")
                (leftover,) = await cur.fetchone()
        finally:
            await pool.close()
        return actor, user, is_app, leftover

    actor, user, is_app, leftover = asyncio.run(check(), loop_factory=asyncio.SelectorEventLoop)
    assert actor == "test|live-check"
    assert user != "tsdbadmin", "connect as recheck_api, not the admin account"
    assert is_app
    assert not leftover


def test_write_tx_requires_actor():
    async def check():
        pool = make_pool(URL)
        with pytest.raises(ValueError):
            async with write_tx(pool, ""):
                pass

    asyncio.run(check(), loop_factory=asyncio.SelectorEventLoop)
