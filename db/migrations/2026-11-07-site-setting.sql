-- Adds site_setting to a database built from an earlier db/schema.sql.
-- A fresh database gets it from schema.sql; run this once on an existing one:
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/migrations/2026-11-07-site-setting.sql

BEGIN;

CREATE TABLE site_setting (
    site_id            text         PRIMARY KEY CHECK (site_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
    show_triage_level  boolean      NOT NULL DEFAULT false,
    updated_at         timestamptz  NOT NULL DEFAULT now()
);

CREATE TRIGGER site_setting_audit       AFTER INSERT OR UPDATE ON site_setting FOR EACH ROW EXECUTE FUNCTION audit_write('site_setting');
CREATE TRIGGER site_setting_no_delete   BEFORE DELETE ON site_setting FOR EACH ROW EXECUTE FUNCTION block_change('site_setting');
CREATE TRIGGER site_setting_no_truncate BEFORE TRUNCATE ON site_setting FOR EACH STATEMENT EXECUTE FUNCTION block_change('site_setting');

REVOKE ALL ON site_setting FROM PUBLIC, recheck_app;
GRANT SELECT, INSERT, UPDATE ON site_setting TO recheck_app;

COMMIT;
