"""FastAPI application.

Run locally from `api/`:

    uv run uvicorn recheck.main:app --reload --loop asyncio:SelectorEventLoop

`--loop` matters on Windows: async psycopg can't use the default ProactorEventLoop.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from psycopg import errors
from psycopg_pool import AsyncConnectionPool

from . import events, scheduler
from .contract.common import OutputModel
from .db import make_pool
from .routes import ROUTERS
from .settings import database_url, scheduler_seconds

log = logging.getLogger(__name__)

HEALTH_TIMEOUT_SECONDS = 3.0


# Database constraints that a normal request can hit, as messages for the client.
CONSTRAINT_MESSAGES = {
    "visit_pager_waiting_uq": "that pager is already given to another waiting patient",
    "submission_pkey": "this submission is already being processed; retry with the same submission_id",
}


async def integrity_error(request: Request, exc: errors.IntegrityError) -> JSONResponse:
    """409 for a known constraint; anything else is a bug, so log it and keep details off the wire."""
    constraint = exc.diag.constraint_name
    if constraint in CONSTRAINT_MESSAGES:
        return JSONResponse(status_code=409, content={"detail": CONSTRAINT_MESSAGES[constraint]})
    log.error("unexpected integrity error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=409, content={"detail": "the request conflicts with the visit's current state"})


class Health(OutputModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unavailable"]


def create_app(pool: AsyncConnectionPool | None = None) -> FastAPI:
    """Build the app. Tests pass their own pool; otherwise one is made from RECHECK_DATABASE_URL."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.pool = pool if pool is not None else make_pool(database_url())
        app.state.broker = events.Broker()
        # Don't wait for a connection: the API still starts, and /health reports the outage.
        await app.state.pool.open(wait=False)
        # Background work runs only in the real server; tests that bring their own pool drive it directly.
        every = scheduler_seconds() if pool is None else 0
        timers = asyncio.create_task(scheduler.run_forever(app.state.pool, every)) if every > 0 else None
        listener = asyncio.create_task(app.state.broker.listen(database_url())) if pool is None else None
        try:
            yield
        finally:
            await events.stop(listener)
            await events.stop(timers)
            await app.state.pool.close()

    app = FastAPI(title="Recheck API", version="0.1.0", lifespan=lifespan)
    app.add_exception_handler(errors.IntegrityError, integrity_error)
    for router in ROUTERS:
        app.include_router(router)

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
