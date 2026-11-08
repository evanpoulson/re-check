"""What the patient screen shows for the department wait and time waited."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from recheck.contract.codes import WaitSource
from recheck.contract.patient import WaitEstimate

POLL_INTERVAL = timedelta(minutes=5)
STALE_AFTER = timedelta(minutes=15)
"""After this long without a successful fetch the screen shows "Estimate unavailable"."""


@dataclass(frozen=True)
class Snapshot:
    """One row of wait_snapshot."""

    fetched_at: datetime
    status: str  # "ok", "unavailable" or "fetch_failed"
    minutes: int | None


def current_estimate(latest: Snapshot | None, last_ok: Snapshot | None, now: datetime) -> WaitEstimate | None:
    """The estimate to show, or None for "Estimate unavailable".

    `latest` is the newest attempt and `last_ok` the newest one with a value.
    If AHS itself reports the site unavailable, nothing is shown. If only our
    fetch failed, the last value stays up until it is STALE_AFTER old.
    """
    if latest is None or last_ok is None or latest.status == "unavailable":
        return None
    if last_ok.minutes is None or now - last_ok.fetched_at > STALE_AFTER:
        return None
    return WaitEstimate(minutes=last_ok.minutes, source=WaitSource.AHS_FEED, as_of=last_ok.fetched_at)


def load_snapshots(cur, site_id: str) -> tuple[Snapshot | None, Snapshot | None]:
    """(latest, last_ok) for a site, for passing to current_estimate. Reads as recheck_app."""
    sql = "SELECT fetched_at, status::text, minutes FROM wait_snapshot WHERE site_id = %s {} ORDER BY fetched_at DESC LIMIT 1"
    cur.execute(sql.format(""), (site_id,))
    latest = cur.fetchone()
    cur.execute(sql.format("AND status = 'ok'"), (site_id,))
    last_ok = cur.fetchone()
    return (Snapshot(*latest) if latest else None, Snapshot(*last_ok) if last_ok else None)


def waited_minutes(triaged_at: datetime, now: datetime) -> int:
    """Whole minutes since triage, never negative."""
    return max(0, int((now - triaged_at).total_seconds() // 60))
