# Recheck database

PostgreSQL with TimescaleDB on Tiger Cloud. [`schema.sql`](schema.sql) is the source of truth for the data model. Keep it aligned with the Pydantic contract in [`api/src/recheck/contract/`](../api/src/recheck/contract/). Its enums mirror `codes.py`.

| Path | Contents |
| --- | --- |
| [`schema.sql`](schema.sql) | The full schema for an empty database: types, tables, triggers, hypertables, roles |
| [`migrations/`](migrations/) | Dated changes for a database made from an earlier `schema.sql`. `schema.sql` already has all of them. |
| [`seed/wait_sites.sql`](seed/wait_sites.sql) | Maps the demo site to its AHS wait-times department |
| [`tests/schema_checks.sql`](tests/schema_checks.sql) | Behaviour checks. They run as the app role and roll back. |

The API loads the synthetic visits. See [Synthetic cohort](../api/README.md#synthetic-cohort).

## Tables

| Table | Contents | Writes |
| --- | --- | --- |
| `visit` | One waiting-room stay: site, CTAS, complaint group, language, channel, QR token hash and encrypted copy, status, both due times. No name or health number. | Insert, update |
| `visit_session` | The one signed-in device of a visit, and how each session ended | Insert, update |
| `submission` | Client-generated submission IDs, to find duplicate retries | Append-only |
| `push_subscription` | The Web Push subscription of a signed-in device. One open subscription for each session. A subscription can end one time. The endpoint and keys never go to the audit log. | Insert, update |
| `push_send` | One row for each check-in reminder. The scheduler claims the row before it sends. The result is written one time. No audit, because the table is a log. | Insert, update |
| `attention_prompt` | The circle-counting check for a check-in, kept so that the server can score it | Append-only |
| `report` | All patient, companion and staff reports, from all channels. Hypertable, 1-day chunks. | Append-only |
| `vitals` | Vitals that staff measure. A correction is a new row that points to the old row. Hypertable, 1-day chunks. | Append-only |
| `task` | The one active review task of a visit: level, routing, acknowledgement, assessment, disposition | Insert, update |
| `task_reason` | Why a rule fired, with its ruleset version and evidence | Append-only |
| `site_setting` | Switches for the full site that the triage nurse can change, for example `show_triage_level` | Insert, update |
| `wait_site` | Maps a Recheck site to an AHS department | Admin only |
| `wait_snapshot` | One row for each poll of the AHS feed, also failed polls. Hypertable, 7-day chunks. | Poller only, append-only |
| `audit_log` | One row for each insert or update, with the actor. Hypertable, 7-day chunks. | Triggers only, append-only |

## Rules in the schema

- **Each write names an actor.** A transaction that writes must first run `SET LOCAL app.actor = '<id>'`. If it does not, the write fails. The API does this in `write_tx` ([`api/src/recheck/db.py`](../api/src/recheck/db.py)).
- **No deletes.** Triggers reject `DELETE` and `TRUNCATE` on all tables. On append-only tables, they also reject `UPDATE`. A correction is a new row.
- **No retention policy.** Do not add one to `report`, `vitals` or `audit_log`.
- **Tasks only escalate.** The level, the escalation and the status of a task only move forward. You cannot change a recorded acknowledgement or assessment.
- **One of each.** One active task for each visit. One signed-in device for each visit. One open push subscription for each session. One waiting patient for each physical pager.
- **First due times.** A new visit gets its first staff reassessment at triage time plus `ctas_interval()`. App visits also get their first patient prompt at that time. The intervals are 15, 30, 60 and 120 minutes for CTAS 2 to 5. These are demo values.

## Roles

| Role | Made by | Permissions |
| --- | --- | --- |
| `recheck_app` | `schema.sql`, no login | Read and insert on all app tables. Update only `visit`, `visit_session`, `task`, `site_setting`, `push_subscription` and `push_send`. Read `wait_site` and `wait_snapshot`. Never delete or truncate. |
| `recheck_api` | You, manually | The login role for the API and the synthetic loader. A member of `recheck_app`. |
| `recheck_poller` | `schema.sql`, no login | Read `wait_site` and insert into `wait_snapshot`. Nothing more. |

Do not connect the app as `tsdbadmin`. `api/tests/test_db_live.py` checks this.

## Set up a database

`schema.sql` is for an empty database. Do not run it two times.

1. As the admin user, run:

   ```sh
   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/tests/schema_checks.sql   # shows "schema checks passed"
   ```

2. If you run the wait-time poller, also run `db/seed/wait_sites.sql` as the admin user.
3. Make the login roles. Keep the passwords out of Git.

   ```sql
   CREATE ROLE recheck_api LOGIN PASSWORD '...' IN ROLE recheck_app;
   ALTER ROLE recheck_poller WITH LOGIN PASSWORD '...';
   ```

4. Put the `recheck_api` URL in `RECHECK_DATABASE_URL`. Put the poller URL in `RECHECK_POLLER_DATABASE_URL`. See [`api/README.md`](../api/README.md#develop).

## Change the schema

1. Edit `schema.sql`, so that a new database gets the change.
2. Add `migrations/YYYY-MM-DD-<change>.sql`. It must bring an existing database to the same state. Put it between `BEGIN` and `COMMIT`. In its header comment, tell if it must run before the API deploy.
3. Update the contract models and code lists that agree with the change.
4. For each new constraint or trigger, add a check to `tests/schema_checks.sql`.
5. Before the deploy, apply the migration to the shared Tiger Cloud database as the admin user.
6. Update the [migration status](#migration-status) table.

There is no migration runner. Nothing records which migrations ran. Examine the database before you apply a migration.

## Migration status

| Migration | Shared Tiger Cloud database |
| --- | --- |
| `2026-11-07-site-setting.sql` | Applied |
| `2026-11-08-visit-complaint-detail.sql` | Not applied. The API and the web app do not use `visit.complaint_detail` (PR #64). The column stays in `schema.sql`, so a new database has it, but nothing writes to it. |
| `2026-11-08-push-reminders.sql` | Applied |
