"""Site settings: switches the triage nurse changes for the whole site."""

from fastapi import APIRouter
from psycopg import AsyncConnection

from ..auth import DeskStaff, Pool
from ..contract.staff import SiteSettings, SiteSettingsUpdate
from ..db import write_tx

router = APIRouter(prefix="/api/site-settings", tags=["site settings"])

DEFAULTS = SiteSettings(show_triage_level=False, updated_at=None)


async def site_settings(conn: AsyncConnection, site_id: str) -> SiteSettings:
    """The site's saved settings, or the defaults if it has never saved any."""
    cur = await conn.execute("SELECT show_triage_level, updated_at FROM site_setting WHERE site_id = %s", [site_id])
    row = await cur.fetchone()
    return SiteSettings(show_triage_level=row[0], updated_at=row[1]) if row else DEFAULTS


@router.get("", response_model=SiteSettings)
async def get_site_settings(staff: DeskStaff, pool: Pool) -> SiteSettings:
    async with pool.connection() as conn:
        return await site_settings(conn, staff.site_id)


@router.put("", response_model=SiteSettings)
async def put_site_settings(body: SiteSettingsUpdate, staff: DeskStaff, pool: Pool) -> SiteSettings:
    """Replace the settings for the staff member's site. Patient screens pick the change up on their next refetch."""
    async with write_tx(pool, staff.actor) as conn:
        cur = await conn.execute(
            """
            INSERT INTO site_setting (site_id, show_triage_level) VALUES (%s, %s)
            ON CONFLICT (site_id) DO UPDATE
                SET show_triage_level = EXCLUDED.show_triage_level, updated_at = now()
            RETURNING show_triage_level, updated_at
            """,
            [staff.site_id, body.show_triage_level],
        )
        level, at = await cur.fetchone()
    return SiteSettings(show_triage_level=level, updated_at=at)
