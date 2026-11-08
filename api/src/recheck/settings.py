"""Runtime settings, read from the environment.

Values come from real environment variables first, then from the repository's
root `.env` file, which is git-ignored and holds local credentials.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# api/src/recheck/settings.py -> repository root
ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


def database_url() -> str:
    """The Postgres URL the API connects with, as the `recheck_api` login role."""
    load_dotenv(ROOT_ENV, override=False)
    url = os.environ.get("RECHECK_DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError(
            f"RECHECK_DATABASE_URL is not set. Add it to {ROOT_ENV} or the environment, e.g. "
            "postgres://recheck_api:PASSWORD@HOST:PORT/tsdb?sslmode=require"
        )
    return url
