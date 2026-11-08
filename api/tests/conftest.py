import asyncio
import os
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient
from psycopg import AsyncConnection

# Offline tests need a secret; a real one in .env takes precedence.
os.environ.setdefault("RECHECK_SECRET_KEY", "test-secret-key-test-secret-key-123456")
# Tests sign staff in with the demo role picker; the Auth0 tests mock Auth0 itself.
os.environ.setdefault("RECHECK_DEMO_STAFF", "true")

from recheck.main import create_app  # noqa: E402
from recheck.settings import database_url  # noqa: E402

try:
    LIVE_URL = database_url()
except RuntimeError:
    LIVE_URL = None

# Async psycopg can't use Windows' default ProactorEventLoop.
BACKEND = {"loop_factory": asyncio.SelectorEventLoop}


class RollbackPool:
    """Stands in for the pool: one real connection inside a transaction that's never committed.

    Routes run their write transactions as savepoints inside it, so they see each
    other's writes, and everything is rolled back when the app shuts down. The
    demo data is append-only, so live tests must never commit.
    """

    def __init__(self, url: str):
        self.url = url
        self.conn: AsyncConnection | None = None

    async def open(self, wait: bool = False):
        pass

    async def close(self):
        if self.conn is not None:
            await self.conn.rollback()
            await self.conn.close()

    @asynccontextmanager
    async def connection(self, timeout: float | None = None):
        if self.conn is None:
            self.conn = await AsyncConnection.connect(self.url)
            await self.conn.execute("SELECT 1")  # open the outer transaction
        yield self.conn


@pytest.fixture
def live_client():
    if LIVE_URL is None:
        pytest.skip("RECHECK_DATABASE_URL not set")
    with TestClient(create_app(RollbackPool(LIVE_URL)), backend_options=BACKEND) as client:
        yield client
