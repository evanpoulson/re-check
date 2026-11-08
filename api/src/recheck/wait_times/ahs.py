"""Parse the AHS estimated emergency wait times feed.

The feed is the JSON behind the public AHS wait-times page, which calls the
same URL from /js/wait-times.min.js and refreshes it every two minutes. It is
undocumented and unversioned, so parsing is defensive: anything unexpected
becomes an unavailable value, never an exception for the whole feed.

Shape (one key per city, then "Emergency" and "Urgent" lists):

    {"Calgary": {"Emergency": [{"Name": "Foothills Medical Centre",
                                "WaitTime": "4 hr 47 min",
                                "TimesUnavailable": "False",
                                "SplitFacility": null, ...}, ...],
                 "Urgent": [...]}, ...}

A facility with separate departments packs them into one record, with every
field joined by "[;]" and the department names in SplitFacility (for example
South Health Campus: "Children's emergency[;]Adult emergency").

AHS terms allow personal, non-commercial use only. Polling it is for the demo;
a pilot needs written permission from AHS.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

FEED_URL = "https://www.albertahealthservices.ca/Webapps/WaitTimes/api/waittimes/en"
SPLIT = "[;]"

_WAIT_TEXT = re.compile(r"^\s*(?:(?P<h>\d{1,3})\s*hrs?)?\s*(?:(?P<m>\d{1,2})\s*mins?)?\s*$", re.IGNORECASE)


@dataclass(frozen=True)
class FacilityWait:
    """One department's entry in the feed."""

    city: str
    category: str  # "Emergency" or "Urgent", the feed's list name
    name: str
    department: str | None  # SplitFacility label, None for single-department facilities
    minutes: int | None  # None when AHS marks it unavailable or the text can't be read
    raw_text: str | None
    unavailable: bool


def parse_wait_text(text: str | None) -> int | None:
    """Minutes from AHS text such as "4 hr 47 min", "47 min" or "5 hr". None if unreadable."""
    if not text:
        return None
    m = _WAIT_TEXT.match(text)
    if not m or (m["h"] is None and m["m"] is None):
        return None
    return int(m["h"] or 0) * 60 + int(m["m"] or 0)


def _parts(value: Any, count: int) -> list[Any]:
    """Split a "[;]"-joined field into `count` parts, padding with None if short."""
    if count == 1:
        return [value]
    parts = value.split(SPLIT) if isinstance(value, str) else []
    return (parts + [None] * count)[:count]


def _clean(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def parse_feed(payload: Any) -> list[FacilityWait]:
    """Every department in the feed. Records that aren't objects are skipped."""
    out: list[FacilityWait] = []
    if not isinstance(payload, dict):
        raise ValueError("AHS feed is not a JSON object")
    for city, lists in payload.items():
        if not isinstance(lists, dict):
            continue
        for category, records in lists.items():
            if not isinstance(records, list):
                continue
            for rec in records:
                if not isinstance(rec, dict) or not isinstance(rec.get("Name"), str):
                    continue
                count = rec["Name"].count(SPLIT) + 1
                names = _parts(rec["Name"], count)
                texts = _parts(rec.get("WaitTime"), count)
                flags = _parts(rec.get("TimesUnavailable"), count)
                depts = _parts(rec.get("SplitFacility"), count)
                for name, text, flag, dept in zip(names, texts, flags, depts, strict=True):
                    if not _clean(name):
                        continue
                    minutes = parse_wait_text(text)
                    marked = str(flag).strip().lower() == "true"
                    out.append(
                        FacilityWait(
                            city=city,
                            category=category,
                            name=_clean(name),
                            department=_clean(dept),
                            minutes=None if marked else minutes,
                            raw_text=_clean(text),
                            unavailable=marked or minutes is None,
                        )
                    )
    return out


def find(waits: list[FacilityWait], city: str, name: str, department: str | None) -> FacilityWait | None:
    """The department a Recheck site maps to. Names compare case-insensitively."""
    for w in waits:
        if (
            w.city.lower() == city.lower()
            and w.name.lower() == name.lower()
            and (w.department or "").lower() == (department or "").lower()
        ):
            return w
    return None
