from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from recheck.contract.codes import WaitSource
from recheck.wait_times.ahs import find, parse_feed, parse_wait_text
from recheck.wait_times.estimate import STALE_AFTER, Snapshot, current_estimate, waited_minutes
from recheck.wait_times.poller import snapshot_rows

FEED = json.loads((Path(__file__).parent / "feed.json").read_text())
NOW = datetime(2026, 11, 7, 19, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("text", "minutes"),
    [("4 hr 47 min", 287), ("47 min", 47), ("5 hr", 300), ("1 hr 0 min", 60), ("0 min", 0), (" 2 hrs 5 mins ", 125)],
)
def test_parses_wait_text(text, minutes):
    assert parse_wait_text(text) == minutes


@pytest.mark.parametrize("text", [None, "", "N/A", "unavailable", "4:47", "hr min", "-5 min"])
def test_unreadable_wait_text_is_none(text):
    assert parse_wait_text(text) is None


@given(st.integers(0, 47), st.integers(0, 59))
def test_wait_text_round_trip(h, m):
    assert parse_wait_text(f"{h} hr {m} min") == h * 60 + m


def test_parses_feed_including_split_departments():
    waits = parse_feed(FEED)
    foothills = find(waits, "Calgary", "Foothills Medical Centre", None)
    assert foothills and foothills.minutes == 287 and not foothills.unavailable

    adult = find(waits, "calgary", "South Health Campus", "Adult emergency")
    child = find(waits, "Calgary", "South Health Campus Children", "Children's emergency")
    assert adult and adult.minutes == 304
    assert child and child.minutes == 218
    # A split department needs its label to match.
    assert find(waits, "Calgary", "South Health Campus", None) is None

    plc = find(waits, "Calgary", "Peter Lougheed Centre", None)
    assert plc and plc.unavailable and plc.minutes is None
    assert find(waits, "Calgary", "Airdrie Community Health Centre", None).category == "Urgent"


def test_feed_that_is_not_an_object_fails():
    with pytest.raises(ValueError):
        parse_feed(["Calgary"])


def test_snapshot_rows_cover_every_status():
    sites = [
        ("a", "Calgary", "Foothills Medical Centre", None),
        ("b", "Calgary", "Peter Lougheed Centre", None),
        ("c", "Calgary", "Closed Hospital", None),
    ]
    rows = snapshot_rows(sites, parse_feed(FEED), None)
    assert [(r[0], r[1], r[2]) for r in rows] == [("a", "ok", 287), ("b", "unavailable", None), ("c", "unavailable", None)]
    failed = snapshot_rows(sites, None, "URLError: timed out")
    assert {r[1] for r in failed} == {"fetch_failed"} and failed[0][4] == "URLError: timed out"


def ok(age: timedelta, minutes: int = 287) -> Snapshot:
    return Snapshot(NOW - age, "ok", minutes)


def test_fresh_value_is_shown():
    snap = ok(timedelta(minutes=3))
    est = current_estimate(snap, snap, NOW)
    assert est and est.minutes == 287 and est.source == WaitSource.AHS_FEED and est.as_of == snap.fetched_at


def test_failed_fetch_keeps_last_value_until_stale():
    failed = Snapshot(NOW, "fetch_failed", None)
    assert current_estimate(failed, ok(STALE_AFTER), NOW) is not None
    assert current_estimate(failed, ok(STALE_AFTER + timedelta(seconds=1)), NOW) is None


def test_ahs_unavailable_hides_value_at_once():
    assert current_estimate(Snapshot(NOW, "unavailable", None), ok(timedelta(minutes=5)), NOW) is None


def test_nothing_stored_is_unavailable():
    assert current_estimate(None, None, NOW) is None
    assert current_estimate(Snapshot(NOW, "fetch_failed", None), None, NOW) is None


def test_waited_minutes():
    assert waited_minutes(NOW - timedelta(minutes=130, seconds=59), NOW) == 130
    assert waited_minutes(NOW + timedelta(minutes=1), NOW) == 0


@pytest.mark.skipif(not os.environ.get("RECHECK_TEST_DATABASE_URL"), reason="needs RECHECK_TEST_DATABASE_URL")
def test_poll_stores_snapshots_and_estimate_reads_them():
    """Runs as the connecting role, which must be able to SET ROLE to recheck_poller and recheck_app."""
    import psycopg

    from recheck.wait_times.estimate import load_snapshots
    from recheck.wait_times.poller import poll_once

    url = os.environ["RECHECK_TEST_DATABASE_URL"]
    site = f"t-{uuid.uuid4().hex[:12]}"
    with psycopg.connect(url) as conn:
        conn.execute("SELECT set_config('app.actor', 'test|wait', true)")
        conn.execute(
            "INSERT INTO wait_site (site_id, ahs_city, ahs_name) VALUES (%s, 'Calgary', 'Foothills Medical Centre')",
            (site,),
        )

    rows = poll_once(url, fetch=lambda: FEED)
    assert (site, "ok", 287, "4 hr 47 min", None) in rows

    def boom():
        raise OSError("offline")

    rows = poll_once(url, fetch=boom)
    assert any(r[0] == site and r[1] == "fetch_failed" for r in rows)

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        latest, last_ok = load_snapshots(cur, site)
    assert latest.status == "fetch_failed" and last_ok.minutes == 287
    est = current_estimate(latest, last_ok, datetime.now(UTC))
    assert est and est.minutes == 287
