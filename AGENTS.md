# Recheck

Recheck helps ER staff follow up on patients whose condition changes after triage while they wait for their first physician or nurse practitioner assessment. Patients and companions report changes. Staff see a ranked review list, act on concerns, and hand off unresolved tasks.

The prototype is a standalone companion to Connect Care and Epic Rover. Use synthetic visits and Recheck's own dashboards. Connect Care remains the clinical record. Direct integration with hospital data and staff workflows is future, hospital-approved work.

## Stack

| Layer | Choice |
| --- | --- |
| Patient and staff web screens | React, Vite, TypeScript, Tailwind CSS |
| API, rules, scheduled checks, simulator | Python 3.12+, Pydantic, FastAPI |
| Shared frontend types | FastAPI OpenAPI → TypeScript via `@hey-api/openapi-ts` |
| Database | PostgreSQL with [TimescaleDB from Tiger Data](https://www.tigerdata.com/timescaledb) |
| Rules tests | pytest and Hypothesis |

The repository currently has [Pydantic contracts](api/README.md), contract tests, and a [TimescaleDB schema](db/schema.sql) with [SQL checks](db/tests/schema_checks.sql). It also has the FHIR [question bank](question-bank/README.md) with its loader. FastAPI routes, generated client types, React screens, rules, scheduled jobs, and live delivery are implementation work. Staff authentication and the dashboard transport are open choices.

Use the contract for request and response shapes and keep database constraints aligned with it. Derive the acting identity and site permissions from the session, and authorize access to any referenced visit. Reports identify the reporter separately from the channel. Reuse the same client-generated submission UUID on retry, and set `app.actor` with transaction-local scope on writes as the `recheck_app` database role. Keep credentials and escalation decisions on the server.

## Demo scope

See the [project plan](docs/recheck-project-plan.md) for pages, parallel workstreams, and sponsor evidence.

- Enrol a synthetic CTAS 2–5 visit and return one QR link, which also serves as the phone fallback for pager visits. Whoever scans it chooses patient or companion. Only one device is signed in per visit, and a second device must confirm to take over. Exchange the token for an HttpOnly visit-session cookie. Store a token hash for lookup and a server-encrypted copy so the desk can show the same QR again. Revoke access when the visit ends.
- Start with a short check-in based on the Martha's Rule wellness question, and branch into chest or back pain, new neurological changes, head injury, or confused and drowsy presentations. Select follow-ups from the CEDIS presenting complaint and new findings, using the fixed question bank in [`question-bank/`](question-bank/README.md). Let patients and companions report a concern at any time. Don't offer the app to children, pregnancy over 20 weeks, self-harm or violence presentations, or major trauma; keep them on the staff list.
- Show changes and missed checks on the staff worklist. Route urgent concerns to the on-duty triage liaison physician or configured backup. Give the triage nurse a quiet overview and the charge nurse an escalation and handover view.
- Demo the full loop first: QR report → staff alert → acknowledgement → assessment or backup escalation. Use synthetic cases for worsening chest pain, a companion reporting sudden speech changes, and an unanswered head-injury check. Aim for under five seconds from online report to dashboard. Add pager, voice, and live wait estimates after the core loop works.

## Rules and data

- Keep question branching, clinical review triggers, and staff routing separate. Use fixed, versioned questions and deterministic rules. Read the [research brief](docs/research/recheck-waiting-room.md) before changing clinical pathways, escalation policy, or pilot scope.
- Route an urgent finding as soon as it is submitted, even from a partial check-in. Follow-ups come afterward. Distinguish a negative answer, an unknown answer, inability to respond, and delivery failure. A reassuring answer cannot automatically clear an open concern.
- A companion can report what they observe. Staff perform clinical exams and measure vitals. Recheck flags patients for review. Clinicians make diagnoses and decide care priority. Use demo thresholds until the site approves clinical rules and deadlines.
- Schedule patient prompts and staff reassessments independently using the two due fields already in the schema. A patient response never resets the staff timer. Missed check-ins create a staff task, including when the patient has no usable digital channel.
- Preserve the initial CTAS and keep task ranking separate from clinical queue position. Use one active task per visit and append versioned reasons with evidence. Increase urgency or add routing recipients without lowering priority or postponing an existing acknowledgement deadline. Track delivery, acknowledgement, and assessment separately. Tasks move from open to acknowledged to completed; completion requires a disposition. The schema routes to roles. Named handover ownership still needs a contract and persistence decision.

## Git workflow

Use trunk-based development with short-lived feature branches.

1. Start each task from current `main` on a small branch such as `feat/qr-check-in`, `fix/missed-check-routing`, or `docs/clinical-scope`.
2. Keep each branch focused on one reviewable change. Open a pull request into `main` and run the checks for the affected area. Split larger features into small increments that keep `main` usable.
3. Protect `main` on the remote. Require pull requests and passing configured checks, and block direct pushes and force pushes. Leave pull request approval and merging to the user.
4. Delete the merged feature branch, sync local `main`, and branch again from the updated trunk.
