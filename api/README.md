# Recheck API

Python back end: API contract, rules, scheduled checks and simulator (see `AGENTS.md`).

## API contract

`src/recheck/contract/` holds a Pydantic model for every request and response body. FastAPI turns them into the OpenAPI spec, and the React app generates its TypeScript types from that spec with `@hey-api/openapi-ts`.

| Module | Contents |
| --- | --- |
| `codes.py` | Fixed code lists (complaint groups, findings, task levels, dispositions) |
| `answers.py` | Answer values: a value or an explicit missing reason |
| `reports.py` | Patient and companion reports from phone, pager or simulator |
| `visits.py` | Enrolment, QR token exchange, visit state |
| `staff.py` | Vitals, "flag higher", acknowledge, assess |
| `tasks.py` | Review tasks the rules produce |
| `patient.py` | What patient and companion screens load |
| `views.py` | Physician worklist, triage board, charge nurse view, handover, quality page |
| `events.py` | Live dashboard notifications |

## Question bank

`src/recheck/question_bank.py` loads the FHIR question bank in `../question-bank/`, checks it against the contract code lists and picks follow-up questions from the complaint group and earlier answers. `src/recheck/attention.py` generates and scores the circle-counting check. See `../question-bank/README.md`.

Conventions:

- Request bodies reject unknown fields, and numbers aren't coerced from strings.
- Timestamps must include a timezone.
- Every write carries a client-generated `submission_id`, resent unchanged on retry.
- A report records who answered (`reporter`) separately from the device (`channel`).
- The visit and the acting staff member come from the session, never the body.
- Question bank item keys are data, checked against the bank version the report names.

## Synthetic cohort

`src/recheck/synthetic/` builds a synthetic Calgary waiting room of 40 visits and loads it into the database. Every visit has check-ins, attention prompts, vitals, tasks and outcomes. It holds no names, health numbers or real data.

```sh
uv run python -m recheck.synthetic.load --dry-run --json cohort.json   # build only
uv run python -m recheck.synthetic.load --tokens-out ../.seed-tokens.json   # load into RECHECK_DATABASE_URL
```

- **Live times.** Times are set relative to the load time, so the board looks live. The same `--seed`, `--batch` and `--anchor` always give the same cohort.
- **One load per batch.** Rows can't be deleted, so each batch name loads once. Use `--batch demo-2` to refresh the demo.
- **Database role.** The loader runs in one transaction as `recheck_app`, with `app.actor = 'seed|synthetic-cohort'`. It needs the current `db/schema.sql`.
- **QR tokens.** Each load generates random QR tokens. `--tokens-out` writes the patient links to a git-ignored file. Until the API encrypts tokens, the desk can't re-show seeded QRs.
- **Demo cases** (`scenario` in the JSON):
  - `chest-worsening`: red task, not yet acknowledged
  - `companion-speech-live`: a companion signed in for the live speech-change report
  - `head-injury-unanswered`: missed check-in, with the staff reassessment also overdue
  - `companion-speech-done`: full loop to rooming
  - `leave-intent`
  - `pager-silent`
  - `confused-takeover`: a second device takes over
  - `desk-question`
  - three visits where the app isn't offered
- **Generated visits.** The other 29 are generated. About 7% leave without being seen. That target comes from Alberta's 4.1–4.8% and Ottawa's 9.1%. Relative effects of triage level, age, arrival hour and ambulance come from NHAMCS 2019–2022, and the crowding effect from Ottawa.
- **Sources.** `calibration.py` lists every number with its source. Values marked "demo assumption" are for the site to replace. This is not a validated risk model.
- **Tests.** `tests/synthetic` checks schema-level invariants across many seeds. Set `RECHECK_TEST_DATABASE_URL` to a scratch database to also run the load test.

## Department wait estimates

`src/recheck/wait_times/` polls the AHS estimated emergency wait times feed every five minutes. The feed is the same undocumented JSON the public AHS wait-times page loads. The poller stores one `wait_snapshot` row for each site in `wait_site`.

```sh
uv run python -m recheck.wait_times.poller --once   # one round
uv run python -m recheck.wait_times.poller          # every 5 minutes; run as its own process
```

- **What the number is.** AHS publishes one figure for each facility: the estimated time from triage to seeing a physician, for a mid-acuity patient arriving now. It is not any patient's remaining wait. The patient screen says "The department's current estimate for new arrivals is about 4 h 47 min. You've been waiting 2 h 10 min." Every CTAS level sees it.
- **Contract.** `PatientHome.wait_estimate` is a `WaitEstimate` (`minutes`, `source`, `as_of`) or null, and `waited_minutes` is computed by the server. `as_of` is Recheck's fetch time, because the feed carries no timestamp. The patient screen refetches `PatientHome` every minute.
- **When it's shown.** `estimate.current_estimate()` shows the last `ok` value until it is 15 minutes old. If AHS itself marks the site unavailable, the screen shows "Estimate unavailable" at once. If only Recheck's fetch failed, the last value stays up until it goes stale.
- **Every attempt is stored.** Each snapshot is `ok` (with minutes), `unavailable` (AHS marked it, the text was unreadable, or the site was missing) or `fetch_failed`, so gaps in the trend are explained. Snapshots are append-only and aren't audited, because they are already a log. Changes to `wait_site` are audited.
- **Database role.** The poller connects with `RECHECK_POLLER_DATABASE_URL` as `recheck_poller`, which can read `wait_site` and insert snapshots, nothing else. `db/schema.sql` creates the role without a password; give it one by hand with `ALTER ROLE recheck_poller WITH LOGIN PASSWORD '...'`. `recheck_app` can only read both tables.
- **Site map.** `db/seed/wait_sites.sql` maps `foothills-demo` to Foothills Medical Centre. Run it as an admin. A facility with separate departments, such as South Health Campus, also needs `ahs_department` set to the feed's `SplitFacility` label.
- **Terms.** The AHS site allows personal, non-commercial use only. Polling it is for the demo; a pilot needs written permission from AHS.
- **Tests.** `tests/wait_times` uses a synthetic copy of the feed's shape. Set `RECHECK_TEST_DATABASE_URL` to also run the poll-and-read test.

## Develop

The project pins Python 3.12 in `.python-version`; `uv` downloads it if needed.

Put settings in the repository's root `.env` (git-ignored). Connect as `recheck_api`, never `tsdbadmin`:

```sh
RECHECK_DATABASE_URL=postgres://recheck_api:PASSWORD@HOST:PORT/tsdb?sslmode=require
RECHECK_SECRET_KEY=...                     # 32+ chars: encrypts QR tokens, signs the staff cookie. One value per database.
RECHECK_PUBLIC_URL=http://localhost:5173   # optional: web app base for QR links ({url}/v/{token})
RECHECK_SITE_ID=foothills-demo             # optional: the demo site staff act for
RECHECK_COOKIE_SECURE=false                # optional: true when served over HTTPS
```

Generate a secret with `uv run python -c "import secrets; print(secrets.token_urlsafe(32))"`.

```sh
uv sync
uv run pytest                 # all tests; live tests skip without RECHECK_DATABASE_URL and always roll back
uv run pytest -m "not live"   # never touch the database
uv run uvicorn recheck.main:app --reload --loop asyncio:SelectorEventLoop
```

Then open `http://127.0.0.1:8000/api/health` and `http://127.0.0.1:8000/docs`. `/api/health` returns 503 if the database can't be reached. Keep `--loop`: async psycopg doesn't work on Windows' default event loop.

## Database access

`recheck/db.py` holds one async pool, opened when the app starts. Every write uses `write_tx(pool, actor)`, which opens a transaction and sets `app.actor` for it; the schema rejects writes without it.

Live tests use `RollbackPool` (`tests/conftest.py`): every request runs inside one transaction that is rolled back, because the demo data is append-only and can't be cleaned up.

## Routes

| Method and path | Who | Body → response |
| --- | --- | --- |
| `GET /api/health` | anyone | `Health` (503 when the database is down) |
| `POST /api/staff/session` | demo role picker | `{role}` → signed HttpOnly `recheck_staff` cookie |
| `GET` / `DELETE /api/staff/session` | staff | current role and site / sign out |
| `POST /api/visits` | triage or charge nurse | `VisitCreate` → `VisitEnrolled` (201; 200 on retry) |
| `GET /api/visits/{id}/link` | triage or charge nurse | `VisitLink`; logs `visit.qr_shown` |
| `POST /api/visits/{id}/sign-out` | triage or charge nurse | `StaffSignOut` → 204 |
| `POST /api/session` | QR holder | `TokenExchange` → `SessionInfo` + HttpOnly `recheck_session` cookie; 409 `SignInConflict`, 404 unknown QR, 410 closed visit |
| `POST /api/session/sign-out` | signed-in device | `SignOut` → 204, clears the cookie |

Staff sign-in is a demo stand-in (`recheck/auth.py`): the role is the identity and the audit actor is `demo|<role>`. Real sign-in replaces `current_staff` without changing routes. Seeded visits store a placeholder ciphertext, so their QR can't be re-shown (409).
