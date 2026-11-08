"""Check-in reminders by Web Push.

A reminder goes at the patient prompt's due time, then every 5 minutes until
the person checks in (which moves the due time) or one CTAS interval has passed.
Slot n is the reminder at due + 5n minutes. The scheduler claims each
(visit, due time, slot) in `push_send` before sending, so it goes out at most
once, even with several API processes. If the scheduler misses a slot, only the
current one is sent.

Sending is a network call to the browser's push service, so it happens outside
any database transaction; the outcome is written afterwards. A 404 or 410 means
the browser dropped the subscription, so it is ended. Reminders are a courtesy:
the missed check-in task (scheduler.py) never depends on one arriving.

The message is the same for everyone and says only that a check-in is due. It
shows on a lock screen, so it never carries a symptom, a level or a name.

Generate a key pair for RECHECK_VAPID_PRIVATE_KEY with:

    uv run python -m recheck.push keygen
"""

import asyncio
import base64
import json
import logging
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlsplit
from uuid import UUID

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

from .db import write_tx
from .settings import Vapid as VapidSettings
from .settings import vapid as vapid_settings

log = logging.getLogger(__name__)

ACTOR = "system|scheduler"
REMINDER_EVERY = timedelta(minutes=5)
# A reminder that can't be delivered within one slot is replaced by the next.
TTL_SECONDS = int(REMINDER_EVERY.total_seconds())
SEND_TIMEOUT_SECONDS = 10

# Generic on purpose: no symptom, level or name ever reaches a lock screen. The
# service worker shows the device's own translation when it has one.
PAYLOAD = json.dumps(
    {"kind": "checkin_due", "title": "Recheck", "body": "It's time for your check-in.", "url": "/check-in"},
    separators=(",", ":"),
)
# Push services keep only the newest undelivered message with the same topic.
HEADERS = {"Urgency": "high", "Topic": "recheck-checkin"}

# Push services the major browsers use. The server sends only to these, so a
# device can't make it post to an arbitrary address.
PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com")
PUSH_HOST_SUFFIXES = (".push.apple.com", ".notify.windows.com")


def allowed_endpoint(url: str) -> bool:
    """True for an https URL on a known push service, with no port or credentials."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or parts.username or parts.password or port not in (None, 443):
        return False
    return host in PUSH_HOSTS or any(host.endswith(s) and len(host) > len(s) for s in PUSH_HOST_SUFFIXES)


def reminder_slot(due: datetime, interval: timedelta, now: datetime) -> int | None:
    """Which reminder is due now: 0 at the due time, n at due + 5n minutes. None outside [due, due + interval)."""
    if now < due or now >= due + interval:
        return None
    return int((now - due) // REMINDER_EVERY)


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64url(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def subscription_keys(p256dh: str, auth: str) -> tuple[str, str] | None:
    """The browser's keys without padding, or None unless they are a P-256 point and a 16-byte secret."""
    p256dh, auth = p256dh.rstrip("="), auth.rstrip("=")
    try:
        point, secret = _unb64url(p256dh), _unb64url(auth)
    except ValueError:
        return None
    if len(point) != 65 or point[0] != 4 or len(secret) != 16:
        return None
    return p256dh, auth


def public_key(private_key: str) -> str:
    """The VAPID application server key (uncompressed P-256 point, base64url) for a private key."""
    key = Vapid.from_string(private_key=private_key).public_key
    return _b64url(key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))


def keygen() -> tuple[str, str]:
    """A new (private, public) VAPID key pair, both base64url."""
    key = ec.generate_private_key(ec.SECP256R1())
    private = _b64url(key.private_numbers().private_value.to_bytes(32, "big"))
    return private, public_key(private)


# ---------------------------------------------------------------------------
# Claiming and sending
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Reminder:
    send_id: UUID
    subscription_id: UUID
    endpoint: str
    p256dh: str
    auth: str


@dataclass(frozen=True)
class Result:
    outcome: str  # push_outcome: sent, gone, failed
    status_code: int | None


async def claim(conn: AsyncConnection) -> list[Reminder]:
    """Record every reminder due now that hasn't been sent, inside the caller's write transaction."""
    cur = await conn.execute(
        """
        SELECT v.id, v.next_prompt_due_at, ctas_interval(v.ctas), now(), p.id, p.endpoint, p.p256dh, p.auth
        FROM visit v
        JOIN visit_session s ON s.visit_id = v.id AND s.revoked_at IS NULL
        JOIN push_subscription p ON p.session_id = s.id AND p.ended_at IS NULL
        WHERE v.status = 'waiting' AND v.app_exclusion IS NULL
          AND v.next_prompt_due_at <= now()
          AND now() < v.next_prompt_due_at + ctas_interval(v.ctas)
        """
    )
    reminders = []
    for visit_id, due, interval, now, sub_id, endpoint, p256dh, auth in await cur.fetchall():
        slot = reminder_slot(due, interval, now)
        if slot is None:
            continue
        inserted = await conn.execute(
            """
            INSERT INTO push_send (visit_id, subscription_id, due_at, slot) VALUES (%s, %s, %s, %s)
            ON CONFLICT ON CONSTRAINT push_send_once DO NOTHING
            RETURNING id
            """,
            [visit_id, sub_id, due, slot],
        )
        row = await inserted.fetchone()
        if row is not None:
            reminders.append(Reminder(row[0], sub_id, endpoint, p256dh, auth))
    return reminders


def deliver(reminder: Reminder, settings: VapidSettings, signer: Vapid) -> Result:
    """Send one reminder to the push service. Blocking; run it in a thread."""
    try:
        response = webpush(
            subscription_info={"endpoint": reminder.endpoint, "keys": {"p256dh": reminder.p256dh, "auth": reminder.auth}},
            data=PAYLOAD,
            vapid_private_key=signer,
            # pywebpush fills in aud and exp on this dict, so pass a fresh one each time.
            vapid_claims={"sub": settings.subject},
            ttl=TTL_SECONDS,
            headers=dict(HEADERS),
            timeout=SEND_TIMEOUT_SECONDS,
        )
        return Result("sent", response.status_code)
    except WebPushException as e:
        code = e.response.status_code if e.response is not None else None
        if code in (404, 410):
            return Result("gone", code)
        log.warning("reminder %s not accepted by the push service: %s", reminder.send_id, code)
        return Result("failed", code)
    except Exception:
        log.exception("reminder %s could not be sent", reminder.send_id)
        return Result("failed", None)


async def record(conn: AsyncConnection, results: list[tuple[Reminder, Result]]) -> None:
    """Write each outcome once, and end subscriptions the push service says are gone."""
    for reminder, result in results:
        await conn.execute(
            "UPDATE push_send SET finished_at = now(), outcome = %s, status_code = %s WHERE id = %s AND finished_at IS NULL",
            [result.outcome, result.status_code, reminder.send_id],
        )
        if result.outcome == "gone":
            await conn.execute(
                "UPDATE push_subscription SET ended_at = now(), ended_reason = 'gone' WHERE id = %s AND ended_at IS NULL",
                [reminder.subscription_id],
            )


class Sender:
    """Sends due reminders. Built once from the settings; None from `configured()` when push is off."""

    def __init__(self, settings: VapidSettings):
        self.settings = settings
        self.signer = Vapid.from_string(private_key=settings.private_key)

    @classmethod
    def configured(cls) -> "Sender | None":
        settings = vapid_settings()
        return cls(settings) if settings else None

    async def run_round(self, pool: AsyncConnectionPool) -> int:
        """Claim, send and record one round of reminders. Returns how many were sent or attempted."""
        async with write_tx(pool, ACTOR) as conn:
            reminders = await claim(conn)
        if not reminders:
            return 0
        results = await asyncio.gather(
            *(asyncio.to_thread(deliver, r, self.settings, self.signer) for r in reminders)
        )
        async with write_tx(pool, ACTOR) as conn:
            await record(conn, list(zip(reminders, results)))
        return len(reminders)


if __name__ == "__main__":
    if sys.argv[1:] != ["keygen"]:
        sys.exit("usage: python -m recheck.push keygen")
    private, public = keygen()
    print(f"RECHECK_VAPID_PRIVATE_KEY={private}")
    print(f"# public key (served by GET /api/patient/push): {public}")
