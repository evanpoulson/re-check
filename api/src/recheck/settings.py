"""Runtime settings, read from the environment.

Values come from real environment variables first, then from the repository's
root `.env` file, which is git-ignored and holds local credentials.
"""

import os
from functools import cache
from pathlib import Path

from dotenv import load_dotenv

from datetime import time

# api/src/recheck/settings.py -> repository root
ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


def _get(name: str, default: str | None = None) -> str | None:
    load_dotenv(ROOT_ENV, override=False)
    value = os.environ.get(name, "").strip()
    return value or default


def database_url() -> str:
    """The Postgres URL the API connects with, as the `recheck_api` login role."""
    url = _get("RECHECK_DATABASE_URL")
    if not url:
        raise RuntimeError(
            f"RECHECK_DATABASE_URL is not set. Add it to {ROOT_ENV} or the environment, e.g. "
            "postgres://recheck_api:PASSWORD@HOST:PORT/tsdb?sslmode=require"
        )
    return url


@cache
def secret_key() -> bytes:
    """Server secret for encrypting QR tokens and signing the demo staff cookie.

    Every API instance that shares a database needs the same value, or the desk
    can't re-show QRs another instance created.
    """
    key = _get("RECHECK_SECRET_KEY")
    if not key or len(key) < 32:
        raise RuntimeError(
            f"RECHECK_SECRET_KEY is not set (or shorter than 32 characters). Add it to {ROOT_ENV}; generate one with "
            "`uv run python -c \"import secrets; print(secrets.token_urlsafe(32))\"`"
        )
    return key.encode()


def public_url() -> str:
    """Base URL of the web app; QR links point at `{public_url}/v/{token}`."""
    return (_get("RECHECK_PUBLIC_URL") or "http://localhost:5173").rstrip("/")


def site_id() -> str:
    """The site staff act for. One site in the demo; real staff sign-in will supply it."""
    return _get("RECHECK_SITE_ID") or "foothills-demo"


def site_timezone() -> str:
    """The site's local time zone, for duty hours and shift handover."""
    return _get("RECHECK_SITE_TIMEZONE") or "America/Edmonton"


def _clock(value: str) -> time:
    hours, _, minutes = value.strip().partition(":")
    return time(int(hours) % 24, int(minutes or 0))


def tlp_hours() -> tuple[time, time] | None:
    """When the triage liaison physician is on duty, as local "HH:MM-HH:MM" (may cross midnight).

    Unset means always on duty. Demo assumption: Alberta runs two 7-hour TLP
    shifts per site, but the site's actual hours aren't known yet.
    """
    value = _get("RECHECK_TLP_HOURS")
    if not value:
        return None
    start, _, end = value.partition("-")
    return _clock(start), _clock(end)


def shift_changes() -> list[time]:
    """Local times nursing shifts change, for the handover window. Demo assumption: 07:00 and 19:00."""
    value = _get("RECHECK_SHIFT_CHANGES") or "07:00,19:00"
    return sorted(_clock(v) for v in value.split(","))


def scheduler_seconds() -> float:
    """How often the timer checks run (missed check-ins, escalation), in seconds.

    Off (0) unless set: the timers make permanent changes to the shared demo
    database, so only the demo machine turns them on (RECHECK_SCHEDULER_SECONDS=15).
    """
    return float(_get("RECHECK_SCHEDULER_SECONDS") or "0")


def cookie_secure() -> bool:
    """Send cookies only over HTTPS. Off by default so local http:// works."""
    return (_get("RECHECK_COOKIE_SECURE") or "false").lower() in ("1", "true", "yes")
