"""Who is on duty: triage liaison physician hours and the current nursing shift.

Pure functions over aware datetimes, so they're easy to test. Hours and shift
changes come from settings and are demo assumptions until the site says otherwise.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def tlp_on_duty(now: datetime, hours: tuple[time, time] | None, tz: str) -> bool:
    """True inside the physician's local duty hours (a window may cross midnight). No hours = always."""
    if hours is None:
        return True
    start, end = hours
    local = now.astimezone(ZoneInfo(tz)).time()
    if start == end:
        return True
    if start < end:
        return start <= local < end
    return local >= start or local < end


def _at(day: date, clock: time, zone: ZoneInfo) -> datetime:
    return datetime.combine(day, clock, tzinfo=zone)


def current_shift(now: datetime, changes: list[time], tz: str) -> tuple[datetime, datetime]:
    """(start, end) of the shift containing `now`, in local time with its UTC offset."""
    zone = ZoneInfo(tz)
    local = now.astimezone(zone)
    candidates = sorted(
        _at(local.date() + timedelta(days=offset), clock, zone)
        for offset in (-1, 0, 1)
        for clock in changes
    )
    start = max(c for c in candidates if c <= local)
    end = min(c for c in candidates if c > local)
    return start, end
