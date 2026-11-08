# Recheck project plan

**Prompt 1, Focus Area 3: Healthcare Accessibility & Literacy.** Recheck connects patients and companions to the clinicians who reassess them while they wait in a Calgary ER. The demo uses synthetic visits and runs next to Connect Care and Rover. Future integration and a one-site pilot need hospital approval.

## Status

| Built | Still to build |
| --- | --- |
| Pydantic contract and contract tests ([`api/`](../api/README.md)) | Charge nurse escalation and handover screens in the web app. The API routes exist. |
| FastAPI routes for enrolment, QR sign-in, reports, staff actions, views and site settings | A live simulator that sends reports. The synthetic cohort loader exists. |
| Rules, the one active task, missed check-in and escalation timers | Pager and voice input |
| Server-Sent Events to staff screens | Named handover ownership (needs a contract and storage decision) |
| [TimescaleDB schema](../db/README.md) and SQL checks, live on Tiger Cloud | A CI workflow that runs the checks on pull requests |
| Auth0 staff sign-in and the demo role picker | |
| Web app: sign-in, enrolment, triage board, physician worklist, visit pages, patient check-in in 15 languages | |
| AHS wait estimate poller | |
| Demo deployment on AWS ([`infra/`](../infra/README.md)) | |

## Pages

| Workflow | Page | Done when |
| --- | --- | --- |
| Triage | Enrolment · `/staff/visits/new` | Staff enter CTAS 2–5, complaint, language, and phone or pager channel. CEDIS is optional. Enrolment returns one QR link. The link works while the visit is waiting. For pager visits, it is also the phone fallback. The person who scans it chooses patient or companion. One device can be signed in at a time. The desk can show the same QR again from the visit. |
| Patient and companion | Check-in · `/check-in` | A phone scan opens the check-in without an account. Answers change the follow-up questions. Urgent findings route immediately. The page shows "Get help now", intent to leave, pending and saved states, and a "What we store" panel. A companion observation is separate from the pain that the patient reports. The page is in the 15 most common mother tongues in Alberta. These translations are drafts, and a certified medical translator must review them before real use. The page shows the current AHS wait estimate for new arrivals (or "Estimate unavailable") and the time waited. It tells the patient that answers do not change their place in line. |
| Clinical review | Physician worklist · `/staff/physician` | A saved report shows with its time and reason. The order is red, amber, silent, leave risk and overdue, then wait time. A missed patient check-in looks different from an overdue staff reassessment. |
| Clinical review | Visit timeline · `/staff/visits/:id` | Staff see the report, the rule, the recipient, the acknowledgement and the assessment. Acknowledgement and assessment are separate actions. A simple symptom trend comes from stored check-ins. Staff can record repeat vitals and flag a concern from the visit. |
| Triage | Triage board · `/staff/triage` | Staff see who is waiting and which staff reassessments are due. The board includes enrolment and "flag a concern". The physician worklist shows missed prompts. To show them on the board, extend its row model or link to the visit. |
| Escalation | Charge nurse escalations · `/staff/escalations` | A simulated urgent alert without an answer goes to the designated backup. The handover tab shows open tasks, routing roles and overdue reassessments. Named assignment and explicit transfer need an agreed contract and a storage change. |

Keep privacy, QR printing, assessment entry and handover inside these screens. The quality summary has a response model. A separate quality page is optional.

## Release gate

1. On a real phone and a staff display, rehearse QR → FastAPI → Tiger Cloud → live physician alert → recorded assessment.
2. Rehearse a missed check-in and backup routing.
3. Measure the time from report to screen. The target is less than five seconds.
4. Make sure that patient responses cannot reset the staff timer.
5. Make sure that reassuring answers cannot clear an urgent task.
6. Make sure that retries do not make duplicate tasks.

The [research brief](research/recheck-waiting-room.md) has the details of the rules and the workflow.

## Workstreams

Five teammates own five workstreams:

- patient and companion check-in
- triage and enrolment
- physician worklist and timeline
- charge nurse escalation and handover
- back-end rules and data

The Pydantic models are the shared contract. Agree on synthetic fixtures. Tell the frontend owners about each contract change. Dashboard notices are change signals: on each notice, refetch the authorized view. Rehearse the full flow together.

## Judging evidence

| Category | What to show |
| --- | --- |
| Innovation & Creativity | A companion reports new speech difficulty on a visit for a different complaint. Recheck immediately makes a review task and offers a related follow-up. |
| Impact & Relevance to Prompt | Show the gap after triage and a realistic Calgary workflow. Give the measured demo latency. Propose time to bedside reassessment, missed checks and alert load as pilot measures. |
| Feasibility & Scalability | Show simple enrolment, one staff worklist, backup ownership and a practical one-site pilot path. Tell which steps need the hospital, and what Connect Care integration could make simpler later. |
| Technical Execution | Show a real report in the database, deterministic routing, independent timers, and backup routing and handover that you can trace. Be ready to explain the schema and one rules test. |
| User Experience & Design | A judge completes the check-in without help. On the staff display, the reason, the next action and the owner are easy to read quickly. Check keyboard navigation and accessible labels. |

## Sponsor awards and integrations

| Priority | Award or resource | Build and show |
| --- | --- | --- |
| Target | **Benevity: Best Local Impact** | Explain the Calgary ER use case, the benefit to patients and companions, the limit of staff workload, and the one-site evaluation plan. Use credible local context. Keep measured demo results separate from proposed pilot outcomes. |
| Target | **Clio: accessibility, trust and transparency** | Show large controls, clear labels, keyboard access, companion reports and an assisted route. Show the privacy panel, the synthetic data, the reason for each alert, and the difference between received, acknowledged and assessed. The runbook and the event site call this award Best in Accessibility. Devpost calls it Best in Trust and Transparency. Confirm the label on the submission form, and show both accessibility and transparency. |
| Core integration | **MLH: Tiger Data** | Use the TimescaleDB report, vitals and audit hypertables. A check-in is one kind of report. Through FastAPI, show a symptom trend and an event timeline from seeded records. Make sure that the demo connects to the Tiger Cloud service, and check any hosting or submission conditions. |
| Done | **MLH: Auth0** | Staff sign-in. FastAPI verifies identity and enforces staff roles. Show that staff can do only the actions for their role, and that patients use the QR without a staff account. |
| Optional | **MLH: Gemini API** | Offer press-to-talk as an input aid with synthetic examples. Map the speech to a fixed answer, and ask the user to confirm it before it is sent. Keep the clinical questions, rules and routing deterministic. Do not add it if it makes the check-in slower or if you cannot rehearse it. |
| Optional | **MLH: GoDaddy Registry** | Use a short eligible domain for the demo QR only if you configure and test it on the venue Wi-Fi. Keep the working deployment URL ready. |
| Optional infrastructure | **MLH: Vultr** | Use it only if the team can deploy and rehearse the same flow there. Select one stable deployment before the recording. |
| Optional team tooling | **MLH: Entire** | Use it only if it fits the development workflow of the team and the eligibility rules of the event. It adds no page. |
| Out of scope | **MLH: Solana. Voltex: real-world energy data** | The demo has no feature for these tracks. Voltex needs real published or measured energy data. |

The runbook gives Arduino units, AWS credits, n8n credits and Keenable credits to participants. A pager can use the report endpoint. Hardware and extra services are stretch work. Check sponsor eligibility and opt-in on the submission form. List only the integrations that the team used and can show.

## Demo and submission

| Time | Content |
| --- | --- |
| 0:00–0:25 | The Calgary waiting-room problem and the fit with Prompt 1 |
| 0:25–1:55 | Scan a QR, report worse symptoms, see the worklist update, and record an assessment. Open the timeline and show the stored trend. |
| 1:55–2:30 | With seeded demo timestamps, show a missed check-in and an urgent alert that goes to the backup |
| 2:30–3:00 | Show accessibility and privacy. Give the measured latency if available. Explain the one-site pilot. Keep a recording of the working flow ready. |

**Devpost deadline:** Sunday, November 8, 2026 at **11:30 a.m. Alberta time**.

- Submit the **2–5 minute video**, a GitHub link that judges can open, the project description and the team details.
- Use the name `TEAM ID - TEAM NAME - Recheck`.
- Disclose AI use.
- Select the applicable prizes on the form.

Sources: External Runbook 2026, PDF pp. 5, 9 and 12–17. [Official event site](https://hackthechangeyyc.ca/). [Event Devpost](https://hack-the-change-2026.devpost.com/).
