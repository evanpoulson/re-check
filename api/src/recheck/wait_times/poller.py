"""Poll the AHS wait-times feed and store one snapshot per mapped site.

    uv run python -m recheck.wait_times.poller            # every 5 minutes, forever
    uv run python -m recheck.wait_times.poller --once     # one round, then exit

Connects with RECHECK_POLLER_DATABASE_URL as the `recheck_poller` role, which
can read wait_site and insert into wait_snapshot, nothing else. Every attempt
is stored: `ok` with minutes, `unavailable` when AHS marks the site
unavailable or omits it, and `fetch_failed` when the feed can't be fetched or
parsed. A failed round never stops the loop.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.request
from datetime import UTC, datetime
from typing import Any

from .ahs import FEED_URL, FacilityWait, find, parse_feed
from .estimate import POLL_INTERVAL

ACTOR = "system|wait-poller"
USER_AGENT = "recheck-wait-poller/0.1"
TIMEOUT_SECONDS = 20

log = logging.getLogger("recheck.wait_poller")


def fetch_feed(url: str = FEED_URL) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:  # noqa: S310 - fixed https URL
        return json.load(resp)


def snapshot_rows(
    sites: list[tuple[str, str, str, str | None]],
    waits: list[FacilityWait] | None,
    error: str | None,
) -> list[tuple[str, str, int | None, str | None, str | None]]:
    """(site_id, status, minutes, raw_text, detail) for each mapped site."""
    rows = []
    for site_id, city, name, department in sites:
        if waits is None:
            rows.append((site_id, "fetch_failed", None, None, error))
            continue
        w = find(waits, city, name, department)
        if w is None:
            rows.append((site_id, "unavailable", None, None, "site not in feed"))
        elif w.unavailable:
            rows.append((site_id, "unavailable", None, w.raw_text, "marked unavailable or unreadable"))
        else:
            rows.append((site_id, "ok", w.minutes, w.raw_text, None))
    return rows


def poll_once(database_url: str, fetch=fetch_feed) -> list[tuple]:
    """Fetch the feed and store a snapshot for every mapped site in one transaction."""
    import psycopg

    waits: list[FacilityWait] | None = None
    error: str | None = None
    try:
        waits = parse_feed(fetch())
    except Exception as exc:  # network, HTTP, JSON or shape error
        error = f"{type(exc).__name__}: {exc}"[:500]
        log.warning("AHS feed fetch failed: %s", error)

    fetched_at = datetime.now(UTC)
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT set_config('app.actor', %s, true)", (ACTOR,))
        cur.execute("SELECT site_id, ahs_city, ahs_name, ahs_department FROM wait_site ORDER BY site_id")
        rows = snapshot_rows(cur.fetchall(), waits, error)
        cur.executemany(
            "INSERT INTO wait_snapshot (site_id, fetched_at, status, minutes, raw_text, detail)"
            " VALUES (%s, %s, %s::wait_fetch_status, %s, %s, %s)",
            [(site, fetched_at, status, minutes, raw, detail) for site, status, minutes, raw, detail in rows],
        )
    for site, status, minutes, _, detail in rows:
        log.info("%s %s %s%s", site, status, minutes if minutes is not None else "-", f" ({detail})" if detail else "")
    return rows


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--database-url", default=os.environ.get("RECHECK_POLLER_DATABASE_URL"))
    parser.add_argument("--interval", type=float, default=POLL_INTERVAL.total_seconds(), help="seconds between rounds")
    parser.add_argument("--once", action="store_true", help="poll one round and exit")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not args.database_url:
        sys.exit("set RECHECK_POLLER_DATABASE_URL or pass --database-url")

    while True:
        started = time.monotonic()
        if args.once:
            poll_once(args.database_url)
            return
        try:
            poll_once(args.database_url)
        except Exception:  # database down: log and try again next round
            log.exception("poll round failed")
        time.sleep(max(0.0, args.interval - (time.monotonic() - started)))


if __name__ == "__main__":
    main()
