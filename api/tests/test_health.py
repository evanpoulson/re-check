from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient

from recheck.main import create_app


class FakeConn:
    def __init__(self, fail: bool):
        self.fail = fail

    async def execute(self, *args, **kwargs):
        if self.fail:
            raise OSError("connection refused")


class FakePool:
    """Stands in for AsyncConnectionPool so these tests never touch a database."""

    def __init__(self, fail: bool = False):
        self.fail = fail
        self.opened = False
        self.closed = False

    async def open(self, wait: bool = True):
        self.opened = True

    async def close(self):
        self.closed = True

    @asynccontextmanager
    async def connection(self, timeout: float | None = None):
        yield FakeConn(self.fail)


def test_health_ok():
    pool = FakePool()
    with TestClient(create_app(pool)) as client:
        assert pool.opened
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert pool.closed


def test_health_reports_database_outage():
    with TestClient(create_app(FakePool(fail=True))) as client:
        response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "unavailable"}


def test_health_is_in_openapi():
    with TestClient(create_app(FakePool())) as client:
        spec = client.get("/openapi.json").json()
    assert "/api/health" in spec["paths"]
    assert "503" in spec["paths"]["/api/health"]["get"]["responses"]
