-- Map the demo site to its AHS wait-times department. Run as an admin after
-- db/schema.sql:
--
--   psql -v ON_ERROR_STOP=1 -f db/seed/wait_sites.sql
--
-- ahs_city is the feed's city key; ahs_name is the facility Name exactly as
-- the feed shows it. For a facility with separate departments, such as South
-- Health Campus, also set ahs_department to the SplitFacility label
-- ('Adult emergency' or 'Children''s emergency').

BEGIN;

SET LOCAL app.actor = 'seed|wait-sites';

INSERT INTO wait_site (site_id, ahs_city, ahs_name, ahs_department)
VALUES ('foothills-demo', 'Calgary', 'Foothills Medical Centre', NULL)
ON CONFLICT (site_id) DO NOTHING;

COMMIT;
