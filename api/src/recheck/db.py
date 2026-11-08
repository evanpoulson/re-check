"""Database access: one async connection pool and a write-transaction helper.

The API logs in as `recheck_api`, a member of `recheck_app`, which can read and
insert but never delete. The schema rejects any write whose transaction hasn't
named the acting person, so every write goes through `write_tx`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool


def make_pool(url: str) -> AsyncConnectionPool:
    """A pool that is created closed; call `await pool.open()` at startup."""
    return AsyncConnectionPool(
        url,
        min_size=1,
        max_size=10,
        open=False,
        # Tiger Cloud closes idle connections; test each one before handing it out.
        check=AsyncConnectionPool.check_connection,
        kwargs={"application_name": "recheck-api"},
    )


@asynccontextmanager
async def write_tx(pool: AsyncConnectionPool, actor: str) -> AsyncIterator[AsyncConnection]:
    """A transaction with `app.actor` set for the audit log.

    Commits when the block exits normally and rolls back on an exception. The
    setting is transaction-local, so it never leaks to the next user of the
    pooled connection.
    """
    if not actor:
        raise ValueError("actor is required for writes")
    async with pool.connection() as conn:
        async with conn.transaction():
            # SET LOCAL doesn't take bind parameters; set_config(..., true) is the same thing.
            await conn.execute("SELECT set_config('app.actor', %s, true)", [actor])
            yield conn
