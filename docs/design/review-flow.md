# Patient and clinician review

The demo starts with synthetic waiting-room visits. Scan a visit QR, report a change, then open the physician worklist and record the response. Nurse enrolment stays in the triage view.

- **Check-in:** Keep the current question and its answers together. The help dock stays within reach. An urgent report goes to the sent screen; a failed send says so.
- **Worklist:** Rank visits by the supplied review rank and show physician-routed tasks. Lead with the reason for review, then the visit reference and deadlines. Keep the last known rows visible if a refresh fails.
- **Visit:** Show the current concern and its next action together. Acknowledge and record assessment as separate steps. Keep earlier reports and administrative actions secondary.
- **Shared design:** Use one clear action per state, quiet surfaces, compact metadata, readable labels, and status text alongside colour. Keep navigation and keyboard order aligned.

The web app uses the shared single-QR contract. In mock mode, visit data is shared between tabs on the same browser and origin, and staff roles are tab-local. A shared API is needed for cross-device delivery. Demo role selection does not replace server authorization.
