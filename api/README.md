# Recheck API

The Python back end. It holds the API contract, the routes, the rules, the timers, the check-in reminders, the synthetic cohort and the wait-time poller.

## Develop

The project pins Python 3.12 in `.python-version`. `uv` downloads it if necessary.

Put the settings in the root `.env` of the repository. Git ignores this file. Connect as `recheck_api`. Do not connect as `tsdbadmin`.

```sh
RECHECK_DATABASE_URL=postgres://recheck_api:PASSWORD@HOST:PORT/tsdb?sslmode=require
RECHECK_SECRET_KEY=...                     # 32+ characters. Encrypts QR tokens and signs the staff cookie. Use one value for each database.
RECHECK_PUBLIC_URL=http://localhost:5173   # optional: base URL of the web app for QR links ({url}/v/{token})
RECHECK_SITE_ID=foothills-demo             # optional: the demo site that staff act for
RECHECK_COOKIE_SECURE=false                # optional: set to true for HTTPS
AUTH0_DOMAIN=recheck.ca.auth0.com          # staff sign-in, see ../auth0/README.md
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_CALLBACK_URL=...                     # optional: default is {RECHECK_PUBLIC_URL}/api/staff/callback
RECHECK_DEMO_STAFF=false                   # optional: true turns on the demo role picker
RECHECK_DEMO_PACE=1                        # optional: 4 gives staff 4x more time to acknowledge, and check-ins 4x more time before silent
RECHECK_DEMO_CHECKINS=false                # optional: true opens the first check-in of a new visit at enrolment, and permits open-checkin
RECHECK_SCHEDULER_SECONDS=15               # demo machine only: turns on the timers (off when not set)
RECHECK_VAPID_PRIVATE_KEY=...              # optional: turns on check-in reminders by Web Push (uv run python -m recheck.push keygen)
RECHECK_VAPID_SUBJECT=mailto:...           # optional: contact for push services. Default is RECHECK_PUBLIC_URL, which must then be https.
RECHECK_SITE_TIMEZONE=America/Edmonton     # optional: local time for duty hours and shifts
RECHECK_TLP_HOURS=08:00-22:00              # optional demo value: physician duty hours. Not set = always on duty.
RECHECK_SHIFT_CHANGES=07:00,19:00          # optional demo value: nursing shift changes for handover
```

To make a secret, run `uv run python -c "import secrets; print(secrets.token_urlsafe(32))"`.

```sh
uv sync
uv run pytest                 # all tests. Live tests skip without RECHECK_DATABASE_URL and always roll back.
uv run pytest -m "not live"   # tests that do not use the database
uv run uvicorn recheck.main:app --reload --loop asyncio:SelectorEventLoop
```

Open `http://127.0.0.1:8000/api/health` and `http://127.0.0.1:8000/docs`. If the API cannot connect to the database, `/api/health` returns 503.

Keep the `--loop` option. Async psycopg does not work with the default Windows event loop.

## API contract

`src/recheck/contract/` has a Pydantic model for each request and response body. FastAPI makes the OpenAPI spec from these models. The web app makes its TypeScript types from that spec (see [`web/README.md`](../web/README.md#generated-files)).

| Module | Contents |
| --- | --- |
| `codes.py` | Fixed code lists: complaint groups, findings, task levels, dispositions |
| `answers.py` | Answer values: a value or an explicit reason why it is missing |
| `reports.py` | Patient and companion reports from phone, pager or simulator |
| `visits.py` | Enrolment, QR token exchange, visit state, open check-in |
| `staff.py` | Vitals, "flag higher", acknowledge, assess, site settings |
| `tasks.py` | The review tasks that the rules make |
| `patient.py` | The data that patient and companion screens load |
| `push.py` | Check-in reminder settings and Web Push subscriptions |
| `views.py` | Physician worklist, triage board, charge nurse view, handover, quality page |
| `events.py` | Live dashboard notices |
| `common.py` | Shared base types |

Conventions:

- Request bodies reject unknown fields. Numbers are not converted from strings.
- Timestamps must include a time zone.
- Each write has a client-generated `submission_id`. A retry sends the same value.
- A report records who answered (`reporter`) separately from the device (`channel`).
- The visit and the acting staff member come from the session, never from the body.
- Question bank item keys are data. The API checks them against the bank version that the report names.

## Routes

| Method and path | Who | Body → response |
| --- | --- | --- |
| `GET /api/health` | anyone | `Health` (503 when the database is down) |
| `GET /api/staff/sign-in-options` | anyone | `{auth0, demo}`: the sign-in buttons to show |
| `GET /api/staff/login?return_to=/path` | browser navigation | 302 to Auth0 (code flow with PKCE). 503 if Auth0 is not configured. |
| `GET /api/staff/callback` | Auth0 redirect | Verifies the ID token and the role. Sets the signed HttpOnly `recheck_staff` cookie (12 h) and sends 302 to `return_to`. On failure, 302 to `/staff/sign-in?error=access_denied\|no_staff_role\|expired\|sign_in_failed`. |
| `GET /api/staff/logout` | browser navigation | Clears the cookie, ends the Auth0 session, 302 to `/staff/sign-in` |
| `POST /api/staff/session` | demo role picker | `{role}` → `recheck_staff` cookie. 403 if `RECHECK_DEMO_STAFF` is off. |
| `GET` / `DELETE /api/staff/session` | staff | User ID, name, role and site / clears the cookie only |
| `GET` / `PUT /api/site-settings` | triage or charge nurse | `SiteSettings` / `SiteSettingsUpdate` → `SiteSettings`. Patient screens get the change on their next refetch. |
| `POST /api/visits` | triage or charge nurse | `VisitCreate` → `VisitEnrolled` (201, or 200 on retry) |
| `GET /api/visits/{id}/link` | triage or charge nurse | `VisitLink`. Logs `visit.qr_shown`. |
| `POST /api/visits/{id}/sign-out` | triage or charge nurse | `StaffSignOut` → 204 |
| `POST /api/session` | QR holder | `TokenExchange` → `SessionInfo` and the HttpOnly `recheck_session` cookie. 409 `SignInConflict`, 404 unknown QR, 410 closed visit. |
| `POST /api/session/sign-out` | signed-in device | `SignOut` → 204, clears the cookie |
| `GET /api/worklist` | triage nurse, physician or charge nurse | `Worklist`: waiting visits in order of open task level (red first), then longest wait |
| `GET /api/triage-board` | triage or charge nurse | `TriageBoard`: task colour and staff reassessment timers, no reasons |
| `GET /api/escalations` | charge nurse | `ChargeNurseView`: escalated tasks, tasks sent to the charge nurse, and nurse flags. When no triage liaison physician is on duty, all open tasks. Highest level first. |
| `GET /api/handover` | triage nurse, physician or charge nurse | `Handover`: the current shift window, all waiting patients in worklist order, open tasks, overdue staff reassessments |
| `GET /api/visits/{id}` | triage nurse, physician or charge nurse | `VisitDetail`: reports, vitals, flags, sign-ins and task events, oldest first |
| `POST /api/tasks/{id}/acknowledge` | triage nurse, physician or charge nurse | `AcknowledgeTask` → `Task`. 409 if the task already has an acknowledgement. |
| `POST /api/tasks/{id}/assess` | triage nurse, physician or charge nurse | `AssessTask` → `Task`. Needs an acknowledgement first. Restarts the staff timer. Roomed, treated and released, left, or not located also close the visit. |
| `POST /api/visits/{id}/vitals` | triage or charge nurse | `VitalsCreate` → `VitalsRecord` (201, or 200 on retry). A correction keeps the original. |
| `POST /api/visits/{id}/flag` | triage nurse | `FlagHigher` → `FlagRecord`. Opens or raises an amber task (`staff_flag`). |
| `POST /api/visits/{id}/status` | triage nurse, physician or charge nurse | `VisitStatusUpdate` → 204. Closes the visit and signs out its device. |
| `POST /api/visits/{id}/exclusion` | triage or charge nurse | `VisitExclusionUpdate` → 204. Stops patient prompts. The staff timer continues. |
| `POST /api/visits/{id}/open-checkin` | triage or charge nurse | `OpenCheckin` → 204. Demo only: 403 if `RECHECK_DEMO_CHECKINS` is off. Opens the check-in of the patient now. The staff timer does not change. |
| `GET /api/events` | any signed-in staff | Server-Sent Events: one `DashboardEvent` for each change at the site of the staff member |
| `GET /api/patient/home` | signed-in device | `PatientHome`: follow-up questions, `checkin_open` (whether the next check-in is open), circle prompt, wait estimate or null, minutes waited. The circle prompt is for the patient only, while a check-in is open. It stays the same until answered. |
| `POST /api/patient/reports` | signed-in device | `PatientReport` → `ReportReceipt`. A retry gives `duplicate: true`. A scheduled check-in before its due time gives 409. |
| `GET /api/patient/push` | signed-in device | `PushConfig`: whether check-in reminders are on, and the public key for the subscription |
| `PUT /api/patient/push/subscription` | signed-in device | `PushSubscriptionSave` → 204. The same subscription again changes nothing. A new one replaces the old one. Known push services only. |
| `DELETE /api/patient/push/subscription` | signed-in device | 204. Turns off reminders for this device. A retry is safe. |

## Staff sign-in

Staff sign in with Auth0. [`../auth0/README.md`](../auth0/README.md) tells how to set up the tenant. The API is the OAuth client, so Auth0 tokens never go to the browser.

- Each account has one role, from the `https://recheck/roles` ID token claim.
- The staff cookie holds the Auth0 user ID, for example `google-oauth2|…` or `auth0|…`. This ID becomes `app.actor` and the value of the `*_by` columns. Thus the audit log names the person.
- Demo role picker sessions use `demo|<role>`.
- The tests turn on the picker in `conftest.py`. They replace Auth0 with a local signing key.

## Database access

`recheck/db.py` holds one async connection pool. The pool opens when the app starts. Each write uses `write_tx(pool, actor)`. This function opens a transaction and sets `app.actor` for it. The schema rejects writes without an actor.

Live tests use `RollbackPool` (`tests/conftest.py`). Each request runs inside one transaction, and the test rolls it back. This is necessary because the demo data is append-only and you cannot delete it.

## Rules and tasks

`recheck/rules.py` decides which review tasks a report makes. `recheck/tasks.py` applies them to the one active task of the visit. Both run in the transaction that stores the report. They agree with the synthetic cohort and the web mocks (ruleset `2026-11-08.demo`). All levels, codes and deadlines are demo values for clinical review.

The rules give weight to answers. They do not count them.

- Specific, time-critical signs are red alone: speech, face, one-sided weakness, breathing, fainting, bleeding, new confusion, new chest pain.
- Broader signs, and signs that the triage complaint already covers, are amber. A second sign or "much worse" makes them red.
- "Much worse" is red only together with "very poor" now.
- "Worse" makes no task if the person also says they feel OK now.
- Each reported sign makes at least a review. The rules never drop a sign.

`rules.weigh` is shared with the synthetic cohort. `web/src/lib/findings.ts` has the same urgent list for the patient screen.

| Report | Task level | Reason code |
| --- | --- | --- |
| A new finding (check-in or standalone) | red, acknowledge in 2 min | `finding_<code>`, one for each finding |
| Feeling much worse / worse | red / amber | `feeling_worse` |
| "I need help now" / "I'm worried" | red / amber | `concern_help_now` / `concern_worried` |
| Question about my wait or care | overdue, to the triage nurse | `concern_desk_question` |
| "I'm leaving" | leave risk | `leaving` |
| Circle count wrong / shown but not answered | overdue | `attention_incorrect` / `attention_unanswered` |

Levels and deadlines only escalate:

- A level only goes up.
- The API only adds recipients.
- An acknowledgement deadline only moves earlier.
- A reassuring answer makes no change.

Timers and reports:

- The API accepts a scheduled check-in only when the patient prompt is due. The check-in restarts that timer.
- The API accepts concerns, new findings, leaving and follow-up answers (`purpose: followup`) at any time. These move no timer.
- No report moves the staff reassessment timer.

Enrolment also rejects a complaint group or a missing exclusion that the CEDIS map contradicts.

A level is only the colour and the rank of the task on the staff dashboards. Nothing pages or notifies a clinician. Thus the patient screen never says that a clinician knows (the API never sends `clinician_told`):

- A clinical task shows "a clinician will check on you".
- "I'm leaving" shows the information for patients who leave.
- All other reports show nothing.

### Timers

`recheck/scheduler.py` runs the timers inside the API every `RECHECK_SCHEDULER_SECONDS` seconds. The timers are off by default.

- **Missed check-in.** A waiting app visit gets a silent `missed_checkin` reason when its patient prompt is 5 minutes overdue. This occurs one time for each due time.
- **Escalation.** A red task without an acknowledgement after its 2-minute deadline becomes escalated. The charge nurse also gets it. The timeline shows the deadline as the time of the escalation.
- **Check-in reminders.** See [Check-in reminders](#check-in-reminders).

The timers write to the database in `RECHECK_DATABASE_URL`, and you cannot undo these writes. Thus, keep the timers off when you develop against the shared demo database. Turn them on only on the demo machine: add `RECHECK_SCHEDULER_SECONDS=15` to its `.env`.

### Demo check-ins

With `RECHECK_DEMO_CHECKINS=true`, the first check-in of a new visit opens at enrolment, not one CTAS interval later. Desk staff can also open a check-in now with `open-checkin` ("Open check-in now" on Visit management). The deploy workflow turns this on for the demo instance.

## Check-in reminders

`recheck/push.py` sends check-in reminders by Web Push. The reminders are on only when `RECHECK_VAPID_PRIVATE_KEY` is set. To make a key, run `uv run python -m recheck.push keygen`. Keep one key for the event, because a new key breaks all saved subscriptions.

- A device that turned on reminders gets a push at the due time of the patient prompt.
- After that, it gets one every 5 minutes until the person checks in or one CTAS interval has passed. This is 3 reminders for CTAS 2 and 24 for CTAS 5.
- The scheduler claims each (visit, due time, slot) in `push_send` before it sends. Thus each reminder goes out one time. The answer of the push service goes into the same row. A 404 or 410 ends the subscription.
- The message says only "It's time for your check-in."
- Reminders stop with the session: sign-out, takeover, or a closed visit.
- Reminders are a courtesy. The missed check-in task never depends on a reminder. Staff screens do not show the reminder status.

## Live updates

Each write sends a `DashboardEvent` ("visit X changed") with `pg_notify` inside its transaction. Thus a notice goes out only if the change commits. One listener in each API process sends the notice over `GET /api/events` to the staff screens at that site. A screen refetches its view on each notice:

```js
const events = new EventSource('/api/events')  // sends the staff cookie and reconnects automatically
events.onmessage = () => refetch()             // e.data is the DashboardEvent JSON
```

| Change | Notice |
| --- | --- |
| Enrolment, sign-in, sign-out, close, exclusion | `visit.changed` |
| Patient report | `report.received`, and `task.changed` if the report made a task |
| Flag, acknowledge, assess, timers | `task.changed` |
| Vitals | `vitals.recorded` |

## Question bank

`src/recheck/question_bank.py` loads the FHIR question bank in `../question-bank/`. It checks the bank against the contract code lists. It selects the follow-up questions from the complaint group and the earlier answers. `src/recheck/attention.py` makes and scores the circle-counting check. See [`../question-bank/README.md`](../question-bank/README.md).

## Synthetic cohort

`src/recheck/synthetic/` makes a synthetic Calgary waiting room of 40 visits and loads it into the database. Each visit has check-ins, attention prompts, vitals, tasks and outcomes. The cohort has no names, no health numbers and no real data.

```sh
uv run python -m recheck.synthetic.load --dry-run --json cohort.json         # make the cohort only
uv run python -m recheck.synthetic.load --tokens-out ../.seed-tokens.json   # load into RECHECK_DATABASE_URL
```

- **Live times.** All times are relative to the load time, so the board looks live. The same `--seed`, `--batch` and `--anchor` always give the same cohort.
- **One load for each batch.** You cannot delete rows, so each batch name loads one time. To refresh the demo, use a new name, for example `--batch demo-2`.
- **Database role.** The loader runs in one transaction as `recheck_app`, with `app.actor = 'seed|synthetic-cohort'`. It needs the current `db/schema.sql`.
- **QR tokens.** Each load makes random QR tokens. `--tokens-out` writes the patient links to a file that Git ignores. Seeded visits store a placeholder ciphertext, so the desk cannot show their QR again (409).
- **Between demos.** Run `uv run python -m recheck.synthetic.reseed`. It discharges all waiting visits and loads a new board of nine visits with a new batch name: the scripted demo cases, one visit without the app and two quiet generated visits. Check-ins and staff reassessments are due one to three hours later, so only `head_injury_unanswered` and `pager_silent` start silent. Open tasks get a minimum of 15 minutes to acknowledge. The command encrypts the QR tokens with `RECHECK_SECRET_KEY`, so the desk can show them again when the key is the same as the API key. `--dry-run` shows the board and does not load it.
- **Tests.** `tests/synthetic` checks schema invariants across many seeds. To also run the load test, set `RECHECK_TEST_DATABASE_URL` to a scratch database.

Demo cases (`scenario` in the JSON):

| Scenario | State |
| --- | --- |
| `chest_worsening` | Red task, no acknowledgement |
| `companion_speech_live` | A companion is signed in for the live speech-change report |
| `head_injury_unanswered` | Missed check-in, and the staff reassessment is also overdue |
| `companion_speech_done` | Full loop to rooming |
| `leave_intent`, `pager_silent`, `desk_question` | One case each |
| `confused_takeover` | A second device takes over |
| (three visits) | The app is not offered |

The other 29 visits are generated:

- About 7% leave before a clinician sees them. This target comes from Alberta (4.1–4.8%) and Ottawa (9.1%).
- The relative effects of triage level, age, arrival hour and ambulance come from NHAMCS 2019–2022. The crowding effect comes from Ottawa.
- `calibration.py` gives the source of each number. The site must replace the values marked "demo assumption". This is not a validated risk model.

## Department wait estimates

`src/recheck/wait_times/` gets the AHS estimated emergency wait times feed every five minutes. The feed is the undocumented JSON that the public AHS wait-times page loads. The poller stores one `wait_snapshot` row for each site in `wait_site`.

```sh
uv run python -m recheck.wait_times.poller --once   # one poll
uv run python -m recheck.wait_times.poller          # every 5 minutes. Run it as a separate process.
```

- **The number.** AHS gives one value for each facility. It is the estimated time from triage to the physician, for a mid-acuity patient who arrives now. It is not the remaining wait of a patient. All CTAS levels see it. Example text: "The department's current estimate for new arrivals is about 4 h 47 min. You've been waiting 2 h 10 min."
- **Contract.** `PatientHome.wait_estimate` is a `WaitEstimate` (`minutes`, `source`, `as_of`) or null. The server calculates `waited_minutes`. `as_of` is the time when Recheck got the value, because the feed has no timestamp. The patient screen refetches `PatientHome` every minute.
- **Display.** `estimate.current_estimate()` shows the last `ok` value until it is 15 minutes old. If AHS marks the site unavailable, the screen shows "Estimate unavailable" immediately. If only the Recheck fetch failed, the last value stays until it is too old.
- **Stored attempts.** Each snapshot is `ok` (with minutes), `unavailable` or `fetch_failed`. `unavailable` means that AHS marked the site, the text was not readable, or the site was missing. Thus the trend explains its gaps. Snapshots are append-only and have no audit, because they are already a log. Changes to `wait_site` have an audit.
- **Database role.** The poller connects with `RECHECK_POLLER_DATABASE_URL` as `recheck_poller`. This role can read `wait_site` and add snapshots, and nothing more. `recheck_app` can only read the two tables. [`../db/README.md`](../db/README.md#roles) tells how to give the poller a password.
- **Site map.** `db/seed/wait_sites.sql` maps `foothills-demo` to Foothills Medical Centre. Run it as an admin. A facility with separate departments, for example South Health Campus, also needs `ahs_department` set to the `SplitFacility` label of the feed.
- **Terms.** The AHS site permits only personal, non-commercial use. The poller is for the demo. A pilot needs written permission from AHS.
- **Tests.** `tests/wait_times` uses a synthetic copy of the feed structure. To also run the poll-and-read test, set `RECHECK_TEST_DATABASE_URL`.
