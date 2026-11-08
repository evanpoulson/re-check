# Recheck documentation

Start with the [repository README](../README.md) for what Recheck is and how to run it, and [`AGENTS.md`](../AGENTS.md) for scope and the rules every change must follow.

## Product and plan

| Document | Read it for |
| --- | --- |
| [Project plan](recheck-project-plan.md) | Pages, parallel workstreams, sponsor evidence, and what is built versus still to do |
| [`AGENTS.md`](../AGENTS.md) | Demo scope, stack, staff sign-in, clinical and data rules, Git workflow |

## Research

Read these before changing clinical pathways, escalation policy or pilot scope.

| Document | Read it for |
| --- | --- |
| [Research brief: adaptive reassessment in the waiting room](research/recheck-waiting-room.md) | The clinical case for Recheck, the workflow, follow-up groups and the data model |
| [Patient view evidence](research/patient-view-evidence.md) | What the evidence supports on the patient screen: escalation buttons, wellness questions, the circle check, and copy fixes |
| [Question bank sources](../question-bank/SOURCES.md) | The evidence behind each question |

## Design

| Document | Read it for |
| --- | --- |
| [Patient and clinician review](design/review-flow.md) | Current visual guidelines and verification notes for the screens |
| [Frontend design](design/frontend.md) | Earlier layout for the triage nurse and patient screens (provisional; `review-flow.md` takes precedence) |
| [UI audit, 8 November 2026](design/ui-audit-2026-11-08.md) | Page-by-page list of visual bugs and doc mismatches found in the running app |
| [`design/previews/`](design/previews/) | Screenshots of the check-in, visit and worklist screens |

## Code areas

| Document | Covers |
| --- | --- |
| [`api/README.md`](../api/README.md) | Contract, routes, rules and tasks, timers, live updates, synthetic cohort, wait-time poller, settings |
| [`web/README.md`](../web/README.md) | Running the front end, mocks, generated contract types, routes, translations |
| [`db/README.md`](../db/README.md) | Tables, enforced rules, roles, database setup and schema changes |
| [`question-bank/README.md`](../question-bank/README.md) | FHIR questionnaire, CEDIS map, versioning, translations |
| [`auth0/README.md`](../auth0/README.md) | Auth0 tenant, roles, judge logins |
| [`infra/README.md`](../infra/README.md) | Demo deployment on AWS, GitHub secrets, troubleshooting, tear-down |
| [`deploy/README.md`](../deploy/README.md) | The Caddy HTTPS front |
