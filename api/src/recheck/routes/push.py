"""Check-in reminders: the signed-in device turns Web Push on or off.

The subscription belongs to the device's visit session, so it stops with the
session (sign-out, takeover, visit closed). Sending is the scheduler's job
(push.py).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..auth import Pool, VisitSession, current_visit_session
from ..contract.push import PushConfig, PushSubscriptionSave
from ..db import write_tx
from ..push import allowed_endpoint, public_key, subscription_keys
from ..settings import vapid

router = APIRouter(prefix="/api/patient/push", tags=["check-in reminders"])

Session = Annotated[VisitSession, Depends(current_visit_session)]


@router.get(
    "",
    response_model=PushConfig,
    responses={401: {"description": "Not signed in, or this device was signed out"}},
)
async def push_config(session: Session) -> PushConfig:
    """Whether reminders are available, and the public key to subscribe with."""
    settings = vapid()
    if settings is None:
        return PushConfig(enabled=False)
    return PushConfig(enabled=True, public_key=public_key(settings.private_key))


@router.put(
    "/subscription",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"description": "Not signed in, or this device was signed out"},
        409: {"description": "Reminders are off on this server"},
        422: {"description": "Not a push service Recheck sends to, or keys that aren't a Web Push subscription"},
    },
)
async def save_subscription(body: PushSubscriptionSave, session: Session, pool: Pool) -> Response:
    """Save this device's subscription. Sending the same one again changes nothing; a new one replaces it."""
    if vapid() is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "check-in reminders are off on this server")
    if not allowed_endpoint(body.endpoint):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "endpoint is not a push service Recheck sends to")
    keys = subscription_keys(body.keys.p256dh, body.keys.auth)
    if keys is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "keys are not a Web Push subscription's keys")
    p256dh, auth = keys

    async with write_tx(pool, session.actor) as conn:
        cur = await conn.execute(
            "SELECT id, endpoint, p256dh, auth FROM push_subscription"
            " WHERE session_id = %s AND ended_at IS NULL FOR UPDATE",
            [session.session_id],
        )
        current = await cur.fetchone()
        if current is not None:
            if tuple(current[1:]) == (body.endpoint, p256dh, auth):
                return Response(status_code=status.HTTP_204_NO_CONTENT)
            await conn.execute(
                "UPDATE push_subscription SET ended_at = now(), ended_reason = 'replaced' WHERE id = %s",
                [current[0]],
            )
        await conn.execute(
            "INSERT INTO push_subscription (session_id, endpoint, p256dh, auth) VALUES (%s, %s, %s, %s)",
            [session.session_id, body.endpoint, p256dh, auth],
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/subscription",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={401: {"description": "Not signed in, or this device was signed out"}},
)
async def end_subscription(session: Session, pool: Pool) -> Response:
    """Turn reminders off for this device. Succeeds if they were already off, so a retry is harmless."""
    async with write_tx(pool, session.actor) as conn:
        await conn.execute(
            "UPDATE push_subscription SET ended_at = now(), ended_reason = 'turned_off'"
            " WHERE session_id = %s AND ended_at IS NULL",
            [session.session_id],
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
