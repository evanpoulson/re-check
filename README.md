# Recheck

Recheck helps emergency department staff follow up on patients whose condition changes after triage. It covers the wait before the first physician or nurse practitioner assessment. Patients and companions report changes from a phone. Staff see a ranked review list, act on concerns, and hand off open tasks.

This is a hackathon prototype:

- It uses only synthetic visits.
- It runs next to Connect Care and Epic Rover. Connect Care stays the clinical record.
- Its questions, rules and deadlines are demo values. They do not have clinical approval.

## How it works

```
patient / companion phone ──QR link──┐
                                     ▼
staff browser ──Auth0 sign-in──► web (React, Vite) ──/api──► api (FastAPI) ──► PostgreSQL + TimescaleDB (Tiger Cloud)
                                     ▲                          │  ▲
                                     └──── Server-Sent Events ──┘  └── question-bank/ (FHIR questions, CEDIS map)
```

1. A triage nurse enrols a visit and gives the patient a QR code.
2. The patient or a companion scans the QR, then answers short check-ins or reports a concern.
3. The API stores the report and runs the rules. In the same transaction, it opens or raises the one review task of the visit.
4. The staff dashboards refresh live. Staff acknowledge the task, then assess the patient.
5. Timers make a task when a check-in is missed. They send unacknowledged urgent tasks to the charge nurse.
6. If the patient turned on reminders, the timers also send a Web Push reminder when a check-in is due.

## Repository map

| Path | Contents |
| --- | --- |
| [`api/`](api/README.md) | FastAPI service: contract, routes, rules, timers, synthetic cohort, wait-time poller |
| [`web/`](web/README.md) | React front end for patients and staff |
| [`db/`](db/README.md) | TimescaleDB schema, migrations, seed data, SQL checks |
| [`question-bank/`](question-bank/README.md) | FHIR questions, CEDIS complaint map, translations |
| [`auth0/`](auth0/README.md) | Auth0 tenant setup for staff sign-in |
| [`infra/`](infra/README.md), [`deploy/`](deploy/README.md), `compose.yaml`, `.github/workflows/` | Demo deployment: Terraform, Docker Compose, Caddy, GitHub Actions |
| [`docs/`](docs/README.md) | Project plan, research briefs, design notes |
| `research_notes/` | Source notes for the patient view evidence brief || `media/` | Source logo. `web/src/components/Brand.tsx` uses it. |
| `EXTERNAL RUNBOOK 2026.pdf` | The runbook from the hackathon organizers: schedule, prompts, judging |
| [`AGENTS.md`](AGENTS.md) | Scope, stack and rules for all changes to the code |

## Quickstart

You need Node.js for the web app and [uv](https://docs.astral.sh/uv/) for the API. uv installs Python 3.12.

### Web app with mocks

You do not need the API or a database.

```sh
cd web
npm install
npm run dev        # http://localhost:5173
```

[`web/README.md`](web/README.md) shows the demo loop and the seeded patient links.

### Full stack

1. Make a root `.env` file. Set `RECHECK_DATABASE_URL` (as `recheck_api`) and `RECHECK_SECRET_KEY` (32+ characters). [`api/README.md`](api/README.md#develop) lists all settings. For a new database, do the steps in [`db/README.md`](db/README.md#set-up-a-database) first.
2. Start the API:

   ```sh
   cd api
   uv sync
   uv run uvicorn recheck.main:app --reload --loop asyncio:SelectorEventLoop   # http://127.0.0.1:8000/docs
   ```

3. Start the web app with the mocks off:

   ```sh
   cd web
   VITE_USE_MOCKS=false npm run dev
   ```

To sign in as staff without Auth0, set `RECHECK_DEMO_STAFF=true`. This turns on the demo role picker.

### Docker

```sh
docker compose up --build     # http://localhost:8080
```

Compose has no database container. It uses the Tiger Cloud service in `RECHECK_DATABASE_URL`. See [`infra/README.md`](infra/README.md).

## Checks

| Area | Command |
| --- | --- |
| API | `cd api && uv run pytest` |
| Web | `cd web && npm run typecheck && npm run lint && npm test && npm run build && npm run check:contract` |
| Database | `psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/tests/schema_checks.sql` |

No CI workflow runs these checks yet. Run them before you open a pull request.

## Contributing

Make a branch from the current `main`. Keep each branch to one change. Open a pull request into `main`. [`AGENTS.md`](AGENTS.md#git-workflow) has the full Git workflow.

Read the [research brief](docs/research/recheck-waiting-room.md) before you change clinical pathways, escalation policy or pilot scope.
