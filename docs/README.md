# Recheck documentation

Start with the [repository README](../README.md). It tells what Recheck is and how to run it. [`AGENTS.md`](../AGENTS.md) has the scope and the rules for all changes.

## Product

| Document | Contents |
| --- | --- |
| [Project plan](recheck-project-plan.md) | Status, pages, release gate, workstreams, judging and sponsor evidence |
| [`AGENTS.md`](../AGENTS.md) | Demo scope, stack, staff sign-in, clinical and data rules, Git workflow |

## Research

Read these documents before you change clinical pathways, escalation policy or pilot scope.

| Document | Contents |
| --- | --- |
| [Adaptive reassessment in the waiting room](research/recheck-waiting-room.md) | The clinical case for Recheck, the workflow, the follow-up groups, the data model |
| [Patient view evidence](research/patient-view-evidence.md) | The evidence for the escalation buttons, the wellness questions, the circle check and the patient text |
| [`research_notes/`](../research_notes/) | Source notes for the patient view evidence: Alberta and AHS, clinical red flags, design and accessibility, self-report evidence, UK precedents |
| [Question bank sources](../question-bank/SOURCES.md) | The evidence for each question |

## Design

| Document | Contents |
| --- | --- |
| [Frontend design](design/frontend.md) | Decisions, routes, design system, each staff and patient screen, structure, open items |
| [Patient and clinician review](design/review-flow.md) | Current visual guidelines for the screens |
| [UI audit, 8 November 2026](design/ui-audit-2026-11-08.md) | Visual bugs and differences from the docs, found in the app on that date |
| [`design/previews/`](design/previews/) | Screenshots of the check-in, visit and worklist screens |

## Code

| Document | Contents |
| --- | --- |
| [`api/README.md`](../api/README.md) | Settings, contract, routes, sign-in, rules and tasks, timers, check-in reminders, live updates, synthetic cohort, wait-time poller |
| [`web/README.md`](../web/README.md) | Run the web app, mocks and seeded visits, routes, check-in reminders, generated files, translations |
| [`db/README.md`](../db/README.md) | Tables, schema rules, roles, database setup, schema changes, migration status |
| [`question-bank/README.md`](../question-bank/README.md) | Questionnaire, CEDIS map, exclusions, translations |
| [`auth0/README.md`](../auth0/README.md) | Auth0 tenant, roles, judge logins |
| [`infra/README.md`](../infra/README.md) | Demo deployment on AWS, GitHub secrets, troubleshooting |
| [`deploy/README.md`](../deploy/README.md) | The Caddy HTTPS front end |
