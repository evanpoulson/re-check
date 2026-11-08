# Recheck

Recheck helps ER staff follow up on patients whose condition changes after triage. It covers the time before the first physician or nurse practitioner assessment. Patients and companions report changes. Staff see a ranked review list, act on concerns, and hand off open tasks.

The prototype is a standalone companion to Connect Care and Epic Rover. It uses synthetic visits and its own dashboards. Connect Care stays the clinical record. Direct integration with hospital data and staff workflows is future work that the hospital must approve.

## Stack

| Layer | Choice |
| --- | --- |
| Patient and staff web screens | React, Vite, TypeScript, Tailwind CSS |
| API, rules, scheduled checks, simulator | Python 3.12+, Pydantic, FastAPI |
| Shared frontend types | FastAPI OpenAPI → TypeScript with `@hey-api/openapi-ts` |
| Database | PostgreSQL with [TimescaleDB from Tiger Data](https://www.tigerdata.com/timescaledb) |
| Rules tests | pytest and Hypothesis |
| Live dashboard updates | Server-Sent Events (`GET /api/events`) |

[`README.md`](README.md) has the repository map and the quickstart. Each folder README tells what is built in that area.

## Contract and data access

- Use the [Pydantic contract](api/README.md#api-contract) for request and response shapes. Keep the database constraints in [`db/schema.sql`](db/README.md) aligned with it.
- Get the acting identity and site permissions from the session. Make sure that the session can access each visit that a request names.
- Record the reporter separately from the channel.
- On a retry, send the same client-generated submission UUID again.
- Write as the `recheck_app` database role. Set `app.actor` with transaction-local scope on each write.
- Keep credentials and escalation decisions on the server.

## Staff sign-in

Staff sign in with Auth0. The team uses Google or GitHub single sign-on. Microsoft is not set up. Judges use demo email-and-password accounts. Each account has one fixed role. Patients and companions do not use Auth0. They sign in with the QR token of the visit.

- The API is the OAuth client and sets the signed `recheck_staff` cookie.
- The demo role picker needs no account. It works only when `RECHECK_DEMO_STAFF=true`.
- The web app reads the signed-in user from `GET /api/staff/session`. The web app never stores a role itself.
- The sign-in page asks `GET /api/staff/sign-in-options` which buttons to show.
- "Sign in" goes to `/api/staff/login`. To sign out, Auth0 users go to `/api/staff/logout`. Demo users call `DELETE /api/staff/session`.
- The charge nurse can open the triage board and the worklist.
- In development, Vite sends `/api` to FastAPI (`RECHECK_API_URL`, default `http://127.0.0.1:8000`). This keeps the cookies and the Auth0 callback on one origin.
- The mocks show only the demo picker.

[`auth0/README.md`](auth0/README.md) tells how to set up the tenant.

## Demo scope

The [project plan](docs/recheck-project-plan.md) lists the pages, the workstreams and the sponsor evidence.

### Enrolment and QR sign-in

- Enrol a synthetic CTAS 2–5 visit and return one QR link. For pager visits, the same link is the phone fallback.
- The person who scans the QR chooses patient or companion.
- Only one device can be signed in for each visit. A second device must confirm before it takes over.
- Exchange the token for an HttpOnly visit-session cookie.
- Store a hash of the token for lookup. Also store a copy that the server encrypts, so that the desk can show the same QR again.
- Revoke access when the visit ends.

### Check-in

- Start with a short check-in based on the Martha's Rule wellness question.
- Branch into chest or back pain, new neurological changes, head injury, or confused and drowsy presentations.
- Select follow-ups from the CEDIS presenting complaint and new findings. Use the fixed question bank in [`question-bank/`](question-bank/README.md).
- Let patients and companions report a concern at any time.
- Do not offer the app for children, pregnancy over 20 weeks, self-harm or violence presentations, or major trauma. Keep these visits on the staff list.

### Staff screens

- Show changes and missed checks on the staff worklist.
- Send urgent concerns to the on-duty triage liaison physician or to the configured backup.
- Give the triage nurse a quiet overview. Give the charge nurse an escalation and handover view.

### Demo order

1. Show the full loop first: QR report → staff alert → acknowledgement → assessment or backup escalation.
2. Use synthetic cases for worsening chest pain, a companion who reports sudden speech changes, and an unanswered head-injury check.
3. Get an online report to the dashboard in less than five seconds.
4. When the core loop works, add pager, voice and live wait estimates.

## Rules and data

Read the [research brief](docs/research/recheck-waiting-room.md) before you change clinical pathways, escalation policy or pilot scope.

- Keep question branching, clinical review triggers and staff routing separate. Use fixed, versioned questions and deterministic rules.
- Route an urgent finding when it arrives, also from a partial check-in. Ask the follow-ups after that.
- Keep these four states different: a negative answer, an unknown answer, unable to respond, and delivery failure.
- A reassuring answer cannot automatically clear an open concern.
- A companion can report what they see. Staff do clinical exams and measure vitals. Recheck flags patients for review. Clinicians make diagnoses and decide care priority.
- Use demo thresholds until the site approves the clinical rules and deadlines.

### Timers

- Schedule patient prompts and staff reassessments independently. Use the two due fields in the schema.
- A patient response never resets the staff timer.
- A missed check-in creates a staff task. This also applies when the patient has no digital channel that works.

### Tasks

- Keep the initial CTAS. Keep the task rank separate from the position in the clinical queue.
- Use one active task for each visit. Add versioned reasons with evidence.
- You can increase urgency or add recipients. Never lower the priority or move an acknowledgement deadline later.
- Track delivery, acknowledgement and assessment separately.
- A task goes from open to acknowledged to completed. Completion needs a disposition.
- The schema routes tasks to roles. Named handover ownership still needs a decision about the contract and the storage.

## Documentation to do

- Write a frontend design document for all staff and patient screens, from the current app. Until then, [`docs/design/review-flow.md`](docs/design/review-flow.md) has the current visual guidelines.

## Git workflow

Use trunk-based development with short-lived feature branches.

1. Start each task from the current `main` on a small branch, for example `feat/qr-check-in`, `fix/missed-check-routing` or `docs/clinical-scope`.
2. Keep each branch to one change that a person can review. Open a pull request into `main`. Run the checks for the area that you changed. Split large features into small increments that keep `main` usable.
3. Protect `main` on the remote. Require pull requests and passing checks. Block direct pushes and force pushes. Let the user approve and merge pull requests.
4. Delete the merged feature branch. Update your local `main`, and make the next branch from it.
