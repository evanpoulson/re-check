# Patient and clinician review

The demo starts with synthetic waiting-room visits. Scan a visit QR, report a change, then open the physician worklist and record the response. Nurse enrolment stays in the triage view.

- **Check-in:** Keep the current question and its answers together. The help dock stays within reach: "I need help now" is always full width, and on small screens or large text the other three fold behind "More options". An urgent report goes to the sent screen; there is no separate urgent screen. A failed send says so.
- **Worklist:** Rank visits by the supplied review rank and show physician-routed tasks. Lead with the reason for review, then the visit reference and deadlines. Keep the last known rows visible if a refresh fails.
- **Visit:** A full page with Overview, Assessment, Timeline and (for the triage nurse and charge nurse) Visit management tabs. There is no side sheet. Show the current concern and its next action together. Acknowledge and record assessment as separate steps. A role that can't assess sees that the assessment is pending. Keep earlier reports and administrative actions secondary.
- **Escalations:** The charge nurse's home, `/staff/escalations`, lists open and escalated tasks. Its Handover tab, `/staff/escalations/handover`, lists waiting patients, open tasks and overdue reassessments. It does not record named handover ownership.
- **Shared design:** Use one clear action per state, quiet surfaces, compact metadata, readable labels, and status text alongside colour. Every task level is a `LevelChip`; blue is only for actions, links and focus. Sizes come from the rem scale in `web/src/index.css`. Keep navigation and keyboard order aligned.

The web app uses the shared single-QR contract. In mock mode, visit data is shared between tabs on the same browser and origin, and staff roles are tab-local. A shared API is needed for cross-device delivery. Demo role selection does not replace server authorization.
