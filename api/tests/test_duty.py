from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from hypothesis import given
from hypothesis import strategies as st

from recheck.duty import current_shift, tlp_on_duty

TZ = "America/Edmonton"
CALGARY = ZoneInfo(TZ)


def local(y, m, d, hh, mm=0) -> datetime:
    return datetime(y, m, d, hh, mm, tzinfo=CALGARY)


def test_no_hours_means_always_on_duty():
    assert tlp_on_duty(local(2026, 11, 8, 3), None, TZ)


def test_daytime_window():
    hours = (time(8), time(22))
    assert tlp_on_duty(local(2026, 11, 8, 8), hours, TZ)
    assert tlp_on_duty(local(2026, 11, 8, 21, 59), hours, TZ)
    assert not tlp_on_duty(local(2026, 11, 8, 22), hours, TZ)
    assert not tlp_on_duty(local(2026, 11, 8, 7, 59), hours, TZ)


def test_window_across_midnight():
    hours = (time(18), time(4))
    assert tlp_on_duty(local(2026, 11, 8, 23), hours, TZ)
    assert tlp_on_duty(local(2026, 11, 8, 3, 59), hours, TZ)
    assert not tlp_on_duty(local(2026, 11, 8, 4), hours, TZ)
    assert not tlp_on_duty(local(2026, 11, 8, 12), hours, TZ)


def test_utc_input_is_read_in_local_time():
    # A fixed UTC-7 zone, so the test doesn't depend on Alberta's clock rules: 04:00 UTC is 21:00 there.
    assert tlp_on_duty(datetime(2026, 11, 8, 4, tzinfo=UTC), (time(20), time(22)), "Etc/GMT+7")
    assert not tlp_on_duty(datetime(2026, 11, 8, 4, tzinfo=UTC), (time(22), time(23)), "Etc/GMT+7")


def test_day_and_night_shifts():
    changes = [time(7), time(19)]
    assert current_shift(local(2026, 11, 8, 12), changes, TZ) == (local(2026, 11, 8, 7), local(2026, 11, 8, 19))
    assert current_shift(local(2026, 11, 8, 22), changes, TZ) == (local(2026, 11, 8, 19), local(2026, 11, 9, 7))
    assert current_shift(local(2026, 11, 8, 3), changes, TZ) == (local(2026, 11, 7, 19), local(2026, 11, 8, 7))
    assert current_shift(local(2026, 11, 8, 7), changes, TZ)[0] == local(2026, 11, 8, 7), "a change time starts the new shift"


def elapsed(start: datetime, end: datetime) -> timedelta:
    """Real time between two instants. Subtracting two datetimes in the same zone ignores offset changes."""
    return end.astimezone(UTC) - start.astimezone(UTC)


def test_shift_across_a_fall_back():
    # Calgary's clocks fell back at 02:00 on 2 Nov 2025 (its last change: Alberta stays on UTC-6 from
    # March 2026 in tzdata 2026.6), so that night shift lasted 13 real hours.
    start, end = current_shift(local(2025, 11, 2, 3), [time(7), time(19)], TZ)
    assert (start, end) == (local(2025, 11, 1, 19), local(2025, 11, 2, 7))
    assert elapsed(start, end) == timedelta(hours=13)


@given(st.datetimes(min_value=datetime(2025, 1, 1), max_value=datetime(2027, 12, 31), timezones=st.just(UTC)))
def test_now_is_always_inside_its_shift(now):
    start, end = current_shift(now, [time(7), time(19)], TZ)
    assert start <= now < end
    assert timedelta(hours=11) <= elapsed(start, end) <= timedelta(hours=13)
