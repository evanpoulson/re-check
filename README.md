# Recheck

Recheck helps emergency department staff follow up on patients whose condition changes after triage, while they wait for their first physician or nurse practitioner assessment. Patients and companions report changes from a phone. Staff see a ranked review list, act on concerns, and hand off unresolved tasks.

This is a hackathon prototype. It uses synthetic visits only, runs alongside Connect Care and Epic Rover (which stay the clinical record), and its questions, rules and deadlines are demo values awaiting clinical review.

## How it fits together

```
patient / companion phone ──QR link──┐
                                     ▼
staff browser ──Auth0 sign-in──► web (React, Vite) ──/api──► api (FastAPI) ──► PostgreSQL + TimescaleDB (Tiger Cloud)
                                     ▲                          │  ▲
                                     └──── Server-Sent Events ──┘  └── question-bank/ (FHIR questions, CEDIS map)
```

1. A triage nurse enrols a visit and shows the patient a QR code.
2. The patient or a companion scans it, signs in with the QR token, and answers short check-ins or reports a concern.
3. The API stores the report, runs the rules, and opens or raises the visit's single review task in the same transaction.
4. Staff dashboards (worklist, triage board, charge nurse view, handover) refresh live and staff acknowledge, then assess.
5. Scheduled checks raise a task when a check-in is missed, and escalate unacknowledged urgent tasks to the charge nurse.

## Repository map

| Path | What's there | Start with |
| --- | --- | --- |
| [`api/`](api/README.md) | FastAPI service: Pydantic contract, routes, rules, scheduler, synthetic cohort, wait-time poller | [`api/README.md`](api/README.md) |
| [`web/`](web/README.md) | React, Vite, TypeScript and Tailwind front end for patients and staff | [`web/README.md`](web/README.md) |
| [`db/`](db/README.md) | TimescaleDB schema, migrations, seed data and SQL checks | [`db/README.md`](db/README.md) |
| [`question-bank/`](question-bank/README.md) | Fixed, versioned FHIR questions, CEDIS complaint map, translations | [`question-bank/README.md`](question-bank/README.md) |
| [`auth0/`](auth0/README.md) | Auth0 tenant setup for staff sign-in | [`auth0/README.md`](auth0/README.md) |
| [`infra/`](infra/README.md), [`deploy/`](deploy/README.md), `compose.yaml`, `.github/workflows/deploy.yml` | Demo deployment: Terraform for one EC2 box, Docker Compose, Caddy, GitHub Actions | [`infra/README.md`](infra/README.md) |
| [`docs/`](docs/README.md) | Project plan, research briefs, design notes | [`docs/README.md`](docs/README.md) |
| `media/` | Source logo image (`web/src/components/Brand.tsx` is cut from it) | |
| `EXTERNAL RUNBOOK 2026.pdf` | The hackathon organisers' runbook: schedule, prompts, judging | |
| [`AGENTS.md`](AGENTS.md) | Product scope, stack and rules for anyone (or any coding agent) changing the code | |

## Quickstart

You need Node.js and npm for the web app, and [uv](https://docs.astral.sh/uv/) for the API (it installs Python 3.12 itself).

### Front end only, against in-browser mocks

No database or API needed.

```sh
cd web
npm install
npm run dev        # http://localhost:5173
```

[`web/README.md`](web/README.md) walks through the demo loop and lists seeded patient links.

### Full stack

1. Create a root `.env` (git-ignored) with at least `RECHECK_DATABASE_URL` (as the `recheck_api` role, never the admin) and `RECHECK_SECRET_KEY` (32+ characters). The full list of settings is in [`api/README.md`](api/README.md#develop). A fresh database needs [`db/README.md`](db/README.md#set-up-a-database) first.
2. Start the API:

   ```sh
   cd api
   uv sync
   uv run uvicorn recheck.main:app --reload --loop asyncio:SelectorEventLoop   # http://127.0.0.1:8000/docs
   ```

3. Start the web app with mocks off. Vite proxies `/api` to the API, so cookies and the Auth0 callback stay same-origin:

   ```sh
   cd web
   VITE_USE_MOCKS=false npm run dev
   ```

For staff sign-in without Auth0, set `RECHECK_DEMO_STAFF=true` to turn on the demo role picker.

### Everything in Docker

```sh
docker compose up --build     # http://localhost:8080
```

There is no database container: Compose uses the Tiger Cloud service in `RECHECK_DATABASE_URL`. See [`infra/README.md`](infra/README.md).

## Checks

| Area | Command |
| --- | --- |
| API | `cd api && uv run pytest` (live database tests skip without `RECHECK_DATABASE_URL` and always roll back; `-m "not live"` skips them) |
| Web | `cd web && npm run typecheck && npm run lint && npm test && npm run build && npm run check:contract` |
| Database | `psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f db/tests/schema_checks.sql` |

`npm run check:contract` fails when the generated TypeScript types or the copied question bank are out of date with the API; run `npm run gen:contract` and commit the result.

## Contributing

Branch from current `main`, keep each branch to one reviewable change, and open a pull request into `main`. See the Git workflow in [`AGENTS.md`](AGENTS.md#git-workflow). Read the [research brief](docs/research/recheck-waiting-room.md) before changing clinical pathways, escalation policy or pilot scope.
