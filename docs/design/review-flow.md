# Patient and clinician review

The demo starts with synthetic waiting-room visits. Scan a visit QR, report a change, then open the physician worklist and record the response. Nurse enrolment stays in the triage view.

| Screen | Guideline |
| --- | --- |
| Check-in | Keep the current question and its answers together. Keep the help dock near. "I need help now" is always full width. On small screens or with large text, the other three buttons fold behind "More options". An urgent report goes to the sent screen. There is no separate urgent screen. If a send fails, the screen says so. |
| Worklist | Use the review rank from the server and show tasks sent to the physician. Show the reason for review first, then the visit reference and the deadlines. If a refresh fails, keep the last rows on the screen. |
| Visit | A full page with the Overview, Assessment, Timeline and Visit management tabs. Only the triage nurse and the charge nurse see Visit management. There is no side sheet. Show the current concern and its next action together. Acknowledge and record assessment are two separate steps. A role that cannot assess sees that the assessment is pending. Make earlier reports and administrative actions secondary. |
| Escalations | The home of the charge nurse, `/staff/escalations`, lists open and escalated tasks. Its Handover tab, `/staff/escalations/handover`, lists waiting patients, open tasks and overdue reassessments. It does not record named handover ownership. |
| All screens | Use one clear action for each state, quiet surfaces, compact metadata and readable labels. Show status as text and colour together. Each task level is a `LevelChip`. Use blue only for actions, links and focus. Sizes come from the rem scale in `web/src/index.css`. Keep the keyboard order the same as the navigation order. |
| Demo data | The staff sign-in page tells that all visits are synthetic. The staff header has no demo badge. |

The web app uses one QR for each visit. With the real API, reports go between devices through the server. With the mocks, visit data is shared only between tabs in one browser on one origin, and each tab has its own staff role. The demo role picker does not replace server authorization.

[`frontend.md`](frontend.md) has the full frontend design. Screenshots are in [`previews/`](previews/).
