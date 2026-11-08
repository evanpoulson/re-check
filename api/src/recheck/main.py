"""FastAPI application.

Run locally from `api/`:

    uv run uvicorn recheck.main:app --reload --loop asyncio:SelectorEventLoop

`--loop` matters on Windows: async psycopg can't use the default ProactorEventLoop.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from psycopg_pool import AsyncConnectionPool

from .contract.common import OutputModel
from .db import make_pool
from .settings import database_url

log = logging.getLogger(__name__)

HEALTH_TIMEOUT_SECONDS = 3.0


class Health(OutputModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unavailable"]


def create_app(pool: AsyncConnectionPool | None = None) -> FastAPI:
    """Build the app. Tests pass their own pool; otherwise one is made from RECHECK_DATABASE_URL."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.pool = pool if pool is not None else make_pool(database_url())
        # Don't wait for a connection: the API still starts, and /health reports the outage.
        await app.state.pool.open(wait=False)
        try:
            yield
        finally:
            await app.state.pool.close()

    app = FastAPI(title="Recheck API", version="0.1.0", lifespan=lifespan)

    @app.get(
        "/api/health",
        response_model=Health,
        responses={503: {"model": Health, "description": "The database can't be reached"}},
        tags=["ops"],
    )
    async def health(request: Request) -> Health | JSONResponse:
        """Whether the API is up and can reach the database."""
        try:
            async with request.app.state.pool.connection(timeout=HEALTH_TIMEOUT_SECONDS) as conn:
                await conn.execute("SELECT 1")
        except Exception:
            log.exception("health check: database unavailable")
            body = Health(status="degraded", database="unavailable")
            return JSONResponse(status_code=503, content=body.model_dump())
        return Health(status="ok", database="ok")

    return app


app = create_app()
