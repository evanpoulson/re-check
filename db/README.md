# Recheck database

PostgreSQL with TimescaleDB, hosted on Tiger Cloud. [`schema.sql`](schema.sql) is the source of truth for the data model. It must stay in step with the Pydantic contract in [`api/src/recheck/contract/`](../api/src/recheck/contract/) (its enums mirror `codes.py`).

| Path | Contents |
| --- | --- |
| [`schema.sql`](schema.sql) | The whole schema for a fresh database: types, tables, triggers, hypertables and roles |
| [`migrations/`](migrations/) | Dated changes for a database built from an earlier `schema.sql`. Each one is already folded into `schema.sql`. |
| [`seed/wait_sites.sql`](seed/wait_sites.sql) | Maps the demo site to its AHS wait-times department |
| [`tests/schema_checks.sql`](tests/schema_checks.sql) | Behaviour checks that run as the app role and roll back |

Synthetic visits are loaded by the API, not by SQL: see [Synthetic cohort](../api/README.md#synthetic-cohort).

## Tables

| Table | Holds | Writes |
| --- | --- | --- |
| `visit` | One waiting-room stay: site, CTAS, complaint group, language, channel, QR token hash and encrypted copy, status, both due times. No name or health number. | Insert, update; no delete |
| `visit_session` | The one signed-in device for a visit, and how each session ended | Insert, update; no delete |
| `submission` | Client-generated submission IDs, so a retry is recognised as a duplicate | Append-only |
| `attention_prompt` | The circle-counting check issued for a check-in, kept so the server can score it | Append-only |
| `report` | Every patient, companion and staff report, from any channel (hypertable, 1-day chunks) | Append-only |
| `vitals` | Staff-measured vitals; a correction is a new row pointing at the old one (hypertable, 1-day chunks) | Append-only |
| `task` | The visit's one active review task: level, routing, acknowledgement, assessment, disposition | Insert, update; no delete |
| `task_reason` | Why a rule fired, with its ruleset version and evidence | Append-only |
| `site_setting` | Site-wide switches the triage nurse can change, such as `show_triage_level` | Insert, update; no delete |
| `wait_site`, `wait_snapshot` | AHS wait-feed mapping, and one snapshot per poll including failures (hypertable, 7-day chunks) | Admin / poller only |
| `audit_log` | One row per insert or update, naming the actor (hypertable, 7-day chunks) | Append-only, written by triggers |

## Rules the schema enforces

- **Every write names an actor.** A transaction that writes must run `SET LOCAL app.actor = '<id>'` first, or it fails. The API does this in `write_tx` ([`api/src/recheck/db.py`](../api/src/recheck/db.py)).
- **Append-only history.** Triggers reject `UPDATE`, `DELETE` and `TRUNCATE` on the append-only tables above, and `DELETE` and `TRUNCATE` on the rest. Corrections are new rows. Don't add a retention policy to `report`, `vitals` or `audit_log`.
- **Escalate-only tasks.** A task's level, escalation and status only move forward, and a recorded acknowledgement or assessment can't be rewritten.
- **One active task per visit, one signed-in device per visit,** and a physical pager bound to one waiting patient at a time.
- **First due times.** Inserting a visit sets the first staff reassessment and, for app visits, the first patient prompt to triage time plus `ctas_interval()`: 15, 30, 60 or 120 minutes for CTAS 2 to 5 (demo values).

## Roles

| Role | Created by | Can |
| --- | --- | --- |
| `recheck_app` | `schema.sql` (no login) | Read and insert everywhere; update only `visit`, `visit_session`, `task` and `site_setting`; read `wait_site` and `wait_snapshot`; never delete or truncate |
| `recheck_api` | You, by hand | The login role the API and the synthetic loader use. Make it a member of `recheck_app`. |
| `recheck_poller` | `schema.sql` (no login) | Read `wait_site` and insert `wait_snapshot`, nothing else. Give it a password by hand. |

Never connect the app as `tsdbadmin`; `api/tests/test_db_live.py` checks for this.

## Set up a database

Run as the admin user. `schema.sql` is for an empty database; it is not safe to run twice.

```sh
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/seed/wait_sites.sql      # only if you run the wait-time poller
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/tests/schema_checks.sql  # prints "schema checks passed"
```

Then create the login roles, with passwords kept outside Git:

```sql
CREATE ROLE recheck_api LOGIN PASSWORD '...' IN ROLE recheck_app;
ALTER ROLE recheck_poller WITH LOGIN PASSWORD '...';
```

Put the `recheck_api` URL in `RECHECK_DATABASE_URL` and the poller's in `RECHECK_POLLER_DATABASE_URL` ([`api/README.md`](../api/README.md#develop)).

## Change the schema

1. Edit `schema.sql` so a fresh database gets the change.
2. Add `migrations/YYYY-MM-DD-<what>.sql` that brings an existing database to the same state, wrapped in `BEGIN`/`COMMIT`. Say in its header comment whether it must run before the API that needs it is deployed.
3. Update the matching contract model and code lists, and add a check to `tests/schema_checks.sql` for any new constraint or trigger.
4. Apply the migration to the shared Tiger Cloud database as the admin before deploying. There is no migration runner, so nothing records which files have run; check the database first.
