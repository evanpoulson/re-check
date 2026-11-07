# Recheck

Recheck helps ER staff follow up on patients whose condition changes after triage while they wait for their first physician or nurse practitioner assessment. Patients and companions report changes. Staff see a ranked review list, act on concerns, and hand off unresolved tasks.

The prototype is a standalone companion to Connect Care and Epic Rover. Use synthetic visits and Recheck's own dashboards. Connect Care remains the clinical record. Direct integration with hospital data and staff workflows is future, hospital-approved work.

## Stack

| Layer | Choice |
| --- | --- |
| Patient and staff web screens | React, Vite, TypeScript, Tailwind CSS |
| API, rules, scheduled checks, simulator | Python and FastAPI |
| Database, staff sign-in, live dashboard updates | Tiga data Postgres, Auth, and Realtime |
| Rules tests | pytest and Hypothesis |

Keep privileged database access and escalation decisions on the server. Use one observation model for patient, companion, staff, pager, and simulator inputs.

## Build scope

1. Enrol a synthetic visit and issue a visit-specific QR link. Exchange its single-use token for a visit session. The patient's browser is the entry point, with no install or account.
2. Start with a short check-in and branch into chest or back pain, new neurological changes, or head injury. Select follow-ups from the presenting complaint and new findings. Let patients and companions report a concern at any time.
3. Show changes and missed checks on the staff worklist. Route urgent concerns to the on-duty triage liaison physician or configured backup. Give the triage nurse a quiet overview and the charge nurse an escalation and handover view.
4. Demo the full loop first: QR report → staff alert → acknowledgement → assessment or backup escalation. Use synthetic cases for worsening chest pain, a companion reporting sudden speech changes, and an unanswered head-injury check. Aim for under five seconds from online report to dashboard. Add pager, voice, and live wait estimates after the core loop works.

## Rules and data

- Keep question branching, clinical review triggers, and staff routing separate. Use fixed, versioned questions and deterministic rules. Read the [research brief](docs/research/recheck-waiting-room.md) before changing clinical pathways, escalation policy, or pilot scope.
- Route an urgent finding as soon as it is submitted, even from a partial check-in. Follow-ups come afterward. Distinguish a negative answer, an unknown answer, inability to respond, and delivery failure. A reassuring answer cannot automatically clear an open concern.
- A companion can report what they observe. Staff perform clinical exams and measure vitals. Recheck flags patients for review. Clinicians make diagnoses and decide care priority. Use demo thresholds until the site approves clinical rules and deadlines.
- Run separate server-side timers for patient prompts and staff reassessments. A patient response never resets the staff timer. Missed check-ins create a staff task, including when the patient has no usable digital channel.
- Track each concern from report through routing, acknowledgement, assessment, and handover. Keep acknowledgement separate from assessment. Record the rule version, evidence, timestamps, and responsible staff role. Append corrections to the encounter history. Deduplicate retries while retaining distinct reports.

## Git workflow

Use trunk-based development with short-lived feature branches.

1. Start each task from current `main` on a small branch such as `feat/qr-check-in`, `fix/missed-check-routing`, or `docs/clinical-scope`.
2. Keep each branch focused on one reviewable change. Open a pull request into `main` and run the checks for the affected area. Split larger features into small increments that keep `main` usable.
3. Protect `main` on the remote. Require pull requests and passing configured checks, and block direct pushes and force pushes. Squash merge after review.
4. Delete the merged feature branch, sync local `main`, and branch again from the updated trunk.
