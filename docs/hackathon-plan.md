# Recheck hackathon build and judging plan

**Prompt 1, Focus Area 3 — Healthcare Accessibility & Literacy.** Recheck connects patients and companions to the clinicians responsible for reassessment while they wait in a Calgary ER. The demo uses synthetic visits and runs alongside Connect Care and Rover. Future integration and a one-site pilot require hospital approval.

## Pages and build order

| Order | Page | Done when |
| --- | --- | --- |
| 1 | Enrolment · `/staff/visits/new` | Staff create a synthetic visit and generate a working patient QR. Generate a separate companion link when enabled. |
| 2 | Patient and companion check-in · `/check-in` | A phone scan opens the check-in without an account. Answers change the follow-up questions, and urgent findings route immediately. Show Get help now, pending and saved states, and a What we store panel. |
| 3 | Physician worklist · `/staff/physician` | A saved report appears with the time and reason. Missed check-ins are visible as a separate type of task. |
| 4 | Visit timeline · `/staff/visits/:id` | Staff can see the report, rule, recipient, acknowledgement and assessment. Acknowledgement and assessment have separate actions. Show a simple symptom trend from stored check-ins. |
| 5 | Triage board · `/staff/triage` | Staff see who is waiting, which patient prompts were missed and which staff reassessments are due. Include enrolment and flagging a concern. |
| 6 | Charge nurse escalations · `/staff/escalations` | A simulated unanswered urgent alert reaches the designated backup. The handover tab shows who owns each unresolved task. |

Use a clearly labelled role picker for the synthetic demo until staff authentication is ready. Keep privacy, QR printing, assessment entry and handover within these screens. The simulator can run as a script.

**Release gate.** Rehearse QR → FastAPI → Tiger Data → live physician alert → recorded assessment on a real phone and staff display. Then rehearse a missed check-in and backup routing. Measure report-to-screen latency, with a target under five seconds. Verify that patient responses cannot reset the staff clock, reassuring answers cannot clear an urgent task, and retries do not create duplicate tasks. Use the [clinical research brief](research/recheck-waiting-room.md) for rule and workflow details.

## Main rubric

| Category | What to show |
| --- | --- |
| Innovation & Creativity | A companion reports new speech difficulty on a visit for another complaint. Recheck immediately creates a review task and offers a relevant follow-up. |
| Impact & Relevance to Prompt | Show the post-triage gap and a realistic Calgary workflow. Report measured demo latency and propose time to bedside reassessment, missed checks, and alert load as pilot measures. |
| Feasibility & Scalability | Show lightweight enrolment, one staff worklist, backup ownership and a practical one-site pilot path. Explain which steps need hospital participation and what Connect Care integration could later simplify. |
| Technical Execution | Demonstrate a real database-backed report, deterministic routing, independent timers and a traceable handoff. Be ready to explain the schema and one rules test. |
| User Experience & Design | Let a judge complete the check-in without coaching. On the staff display, make the reason, next action and owner readable at a glance. Verify keyboard navigation and accessible labels. |

## Side pots and integrations

| Priority | Award or resource | Build and show |
| --- | --- | --- |
| Target | **Benevity — Best Local Impact** | Explain the Calgary ER use case, the patient and companion benefit, the staff workload constraint and the one-site evaluation plan. Use credible local context and separate measured demo results from proposed pilot outcomes. |
| Target | **Clio — accessibility, trust and transparency** | Demonstrate large controls, clear labels, keyboard access, companion reporting and an assisted route. Show the privacy panel, synthetic data, the reason an alert fired, and the distinction between received, acknowledged and assessed. The runbook and event site call this Best in Accessibility. Devpost lists Best in Trust and Transparency. Confirm the submission label and cover both sets of criteria. |
| Core integration | **MLH — Tiger Data** | Use TimescaleDB for timestamped check-ins, vitals and audit events. Show a symptom trend and event timeline queried from seeded records through FastAPI. This uses the [existing schema](../db/schema.sql). Verify the demo actually connects to the selected Tiger Data instance and check any hosting or submission conditions. |
| First optional integration | **MLH — Auth0** | If time allows, use it for staff sign-in. FastAPI verifies identity and enforces staff roles. Demo that staff can access only their permitted actions while patients still enter via QR without a staff account. |
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
