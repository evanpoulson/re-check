# Recheck project plan

**Prompt 1, Focus Area 3 — Healthcare Accessibility & Literacy.** Recheck connects patients and companions to the clinicians responsible for reassessment while they wait in a Calgary ER. The demo uses synthetic visits and runs alongside Connect Care and Rover. Future integration and a one-site pilot require hospital approval.

## Repository state

| Available | Still to build |
| --- | --- |
| [Pydantic contracts](../api/README.md) and contract tests for QR exchange, reports, staff actions, tasks, views, and dashboard notices. | FastAPI routes and OpenAPI generation, generated React client types, staff/session authorization, and React screens. The routes below are proposed UI routes. |
| [TimescaleDB schema](../db/schema.sql) and [SQL checks](../db/tests/schema_checks.sql). The schema already has two visit deadlines, one active task per visit, separate acknowledgement and assessment fields, and append-only report, vitals, task reason, submission, and audit records. | Database connection and transactional writes, question-bank content and rules, scheduled checks, read models, event delivery, and simulator. A schema in Git does not establish a live Tiger Data deployment. |

## Pages by workflow

| Workflow | Page | Done when |
| --- | --- | --- |
| Triage | Enrolment · `/staff/visits/new` | Staff enter CTAS 2–5, complaint, language, and phone or pager channel. CEDIS is optional. Enrolment returns one QR link, active while the visit is waiting, which also serves as the phone fallback for pager visits. Whoever scans it chooses patient or companion, with one device signed in at a time. The desk can show the same QR again from the visit. |
| Patient and companion | Patient and companion check-in · `/check-in` | A phone scan opens the check-in without an account. Answers change the follow-up questions, and urgent findings route immediately. Show Get help now, intent to leave, pending and saved states, and a What we store panel. Separate a companion observation from patient self-reported pain. The contract supports English, French, and the 13 most common other mother tongues in Canada; translated question content still needs to be supplied. Show the department's current AHS wait estimate for new arrivals (or "Estimate unavailable") and the time waited, and explain that answers do not change the patient’s place in line. |
| Clinical review | Physician worklist · `/staff/physician` | A saved report appears with the time and reason. Rank red, amber, silent, leave risk, and overdue, then by wait time. Distinguish a missed patient check-in from an overdue staff reassessment. |
| Clinical review | Visit timeline · `/staff/visits/:id` | Staff can see the report, rule, recipient, acknowledgement and assessment. Acknowledgement and assessment have separate actions. Show a simple symptom trend from stored check-ins. Allow staff to record repeat vitals and flag a concern from the visit as permitted. |
| Triage | Triage board · `/staff/triage` | Staff see who is waiting and which staff reassessments are due. Include enrolment and flagging a concern. If the board should show a distinct missed-prompt indicator, extend its current row model or link to the visit. The physician worklist already models both indicators. |
| Escalation | Charge nurse escalations · `/staff/escalations` | A simulated unanswered urgent alert reaches the designated backup. The handover tab shows open tasks, routing roles, and overdue reassessments. Named assignment and explicit transfer require an agreed contract and storage change. |

Use a clearly labelled role picker for the synthetic demo until staff authentication is ready. Keep privacy, QR printing, assessment entry and handover within these screens. The simulator can run as a script. The quality summary already has a response model; a separate quality page is optional.

**Release gate.** Rehearse QR → FastAPI → Tiger Data → live physician alert → recorded assessment on a real phone and staff display. Then rehearse a missed check-in and backup routing. Measure report-to-screen latency, with a target under five seconds. Verify that patient responses cannot reset the staff clock, reassuring answers cannot clear an urgent task, and retries do not create duplicate tasks. Use the [clinical research brief](research/recheck-waiting-room.md) for rule and workflow details.

## Parallel work for five teammates

Split ownership across five workstreams: patient and companion check-in, triage and enrolment, physician worklist and timeline, charge nurse escalation and handover, and backend rules and data. Use the checked-in Pydantic models as the shared contract. Agree on synthetic fixtures and coordinate any contract changes with the frontend. Dashboard notices are change signals; refetch the authorized view on receipt and reconnect. Choose the transport separately. Rehearse the integrated flow together.

## Judging evidence

| Category | What to show |
| --- | --- |
| Innovation & Creativity | A companion reports new speech difficulty on a visit for another complaint. Recheck immediately creates a review task and offers a relevant follow-up. |
| Impact & Relevance to Prompt | Show the post-triage gap and a realistic Calgary workflow. Report measured demo latency and propose time to bedside reassessment, missed checks, and alert load as pilot measures. |
| Feasibility & Scalability | Show lightweight enrolment, one staff worklist, backup ownership and a practical one-site pilot path. Explain which steps need hospital participation and what Connect Care integration could later simplify. |
| Technical Execution | Demonstrate a real database-backed report, deterministic routing, independent timers and traceable backup routing and handover. Be ready to explain the schema and one rules test. |
| User Experience & Design | Let a judge complete the check-in without coaching. On the staff display, make the reason, next action and owner readable at a glance. Verify keyboard navigation and accessible labels. |

## Side pots and integrations

| Priority | Award or resource | Build and show |
| --- | --- | --- |
| Target | **Benevity — Best Local Impact** | Explain the Calgary ER use case, the patient and companion benefit, the staff workload constraint and the one-site evaluation plan. Use credible local context and separate measured demo results from proposed pilot outcomes. |
| Target | **Clio — accessibility, trust and transparency** | Demonstrate large controls, clear labels, keyboard access, companion reporting and an assisted route. Show the privacy panel, synthetic data, the reason an alert fired, and the distinction between received, acknowledged and assessed. The runbook and event site call this Best in Accessibility. Devpost lists Best in Trust and Transparency. Confirm the submission label and demonstrate both accessibility and transparency. |
| Core integration | **MLH — Tiger Data** | Use the existing TimescaleDB report, vitals, and audit hypertables. Check-ins are one report kind. Show a symptom trend and event timeline queried from seeded records through FastAPI. This uses the [existing schema](../db/schema.sql). Verify the demo actually connects to the selected Tiger Data instance and check any hosting or submission conditions. |
| Optional | **MLH — Auth0** | If time allows, use it for staff sign-in. FastAPI verifies identity and enforces staff roles. Demo that staff can access only their permitted actions while patients still enter via QR without a staff account. |
| Optional | **MLH — Gemini API** | Offer press-to-talk as an input aid with synthetic examples. Map the speech to a fixed answer and ask the user to confirm it before submitting. Keep clinical questions, rules and routing deterministic. Skip if it slows the primary check-in or cannot be rehearsed. |
| Optional | **MLH — GoDaddy Registry** | Use a short eligible domain for the demo QR only if it is configured and tested on venue Wi-Fi. Keep the working deployment URL ready. |
| Optional infrastructure | **MLH — Vultr** | Consider it for the frontend or FastAPI only if the team can deploy and rehearse the same working flow there. Choose one stable deployment before recording. |
| Optional team tooling | **MLH — Entire** | Consider only if it fits the team's development workflow and the event's eligibility rules. It adds no patient or staff page. |
| Out of scope | **MLH — Solana; Voltex — real-world energy data** | These tracks have no planned feature in the Recheck demo. Voltex requires actual published or measured energy data. |

The runbook offers Arduino units, AWS credits, n8n credits and Keenable credits as participant resources. A pager can reuse the report endpoint if ready. Treat hardware, live wait estimates and any extra services as stretch work. Confirm sponsor eligibility and opt-in requirements on the event submission form. List only integrations the team actually used and can demonstrate.

## Demo and submission

- **0:00–0:25** — Calgary waiting-room problem and Prompt 1 fit.
- **0:25–1:55** — Scan a QR, report worsening symptoms, see the clinician worklist update, and record an assessment. Open the timeline and show the stored trend.
- **1:55–2:30** — Show a missed check-in and an urgent alert transferred to the backup using seeded demo timestamps.
- **2:30–3:00** — Show accessibility and privacy, report measured latency if available, and explain the one-site pilot. Keep a recording of the working flow ready.
- **Devpost cutoff** — Sunday, November 8, 2026 at **11:30 a.m. Alberta time**. Submit the **2–5 minute video**, accessible GitHub link, project description and team details. Use `TEAM ID - TEAM NAME - Recheck` and disclose AI use. Check applicable prize selections in the form.

Sources: External Runbook 2026, PDF pp. 5, 9 and 12–17; [official event site](https://hackthechangeyyc.ca/); [event Devpost](https://hack-the-change-2026.devpost.com/).
