"""Idempotent writes keyed on the client's `submission_id`.

A client creates one submission ID per action and resends it unchanged on retry.
The first request records it; a retry with the same body is a replay (the
route returns the original result without writing again); the same ID with a
different body or from someone else is refused.
"""

import hashlib
import json
from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, status
from psycopg import AsyncConnection
from pydantic import BaseModel


@dataclass(frozen=True)
class Previous:
    visit_id: UUID | None


def fingerprint(body: BaseModel, **context: object) -> bytes:
    """Hash of the request body (minus its submission ID) plus anything from the path."""
    data = body.model_dump(mode="json", exclude={"submission_id"})
    data["_context"] = {k: str(v) for k, v in context.items()}
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).digest()


async def find(
    conn: AsyncConnection, submission_id: UUID, *, actor: str, endpoint: str, fp: bytes
) -> Previous | None:
    """The earlier result if this is a retry; None if the ID is new. 409 if the ID was used for something else.

    Call inside the write transaction. If two first attempts race, both see None
    and the second `record` fails on the primary key; the app answers 409 and the
    client's next retry finds the first attempt here. (No row lock: the app role
    can't lock append-only tables, by design.)
    """
    cur = await conn.execute(
        "SELECT actor, endpoint, fingerprint, visit_id FROM submission WHERE id = %s",
        [submission_id],
    )
    row = await cur.fetchone()
    if row is None:
        return None
    if (row[0], row[1], bytes(row[2])) != (actor, endpoint, fp):
        raise HTTPException(status.HTTP_409_CONFLICT, "submission_id was already used for a different request")
    return Previous(visit_id=row[3])


async def record(
    conn: AsyncConnection,
    submission_id: UUID,
    *,
    actor: str,
    endpoint: str,
    fp: bytes,
    visit_id: UUID | None,
) -> None:
    await conn.execute(
        "INSERT INTO submission (id, actor, endpoint, fingerprint, visit_id) VALUES (%s, %s, %s, %s, %s)",
        [submission_id, actor, endpoint, fp, visit_id],
    )
