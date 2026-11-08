# Recheck review-flow design

Three screens carry the demo: patient check-in, physician worklist, and visit assessment. QR exchange is an entry state; role navigation is demo scaffolding. Triage and enrolment stay available.

## Direction and trade-offs

Choose an editorial work surface: warm near-white canvas, white reading surfaces, ink typography, quiet rules, compact 8px corners and one restrained blue interaction colour. Urgent red and warning amber express task meaning only. Keep the self-hosted Atkinson Hyperlegible Next font and Lucide icons. A dense table everywhere would fit more records but weaken phone reading; large cards everywhere would waste iPad space. Use aligned concern-led rows on staff screens and a single reading column on patient screens.

The assistant selected this scope under the user's one-shot instruction. Existing layout choices are not design constraints. Reuse the repository primitives rather than installing a competing component system.

## Hierarchy

- Worklist: reason for review, then visit reference and original complaint, then routing/status and deadlines. Consume server rank; never infer queue position. Separate awaiting acknowledgement from acknowledged tasks with labelled filters. No empty decorative metrics.
- Visit: active concern and next action first. Delivery, acknowledgement and completed assessment remain separate. Secondary vitals, administrative actions, rule evidence and enrolment context use native disclosures. Show stored patient pain values with their timestamps, including missing values.
- Phone: question and response choices lead. Help stays visible; other concerns use quieter controls. Keep fixed question-bank wording, companion distinction, receipt/offline feedback, privacy and queue-position promise.

## Reusable rules

Use 4/8px spacing increments, 24–40px page insets, 16px staff text, 18px patient body text, 28–36px screen headings. Content width: staff 1200px; phone reading column 448px. Staff controls at least 44px high, patient answers 56px. Never communicate status only with colour. Focus uses a 3px blue outline. Do not truncate clinical reasons. Use plain text for metadata rather than badge collections. Primary action appears once per task state. Empty, loading and retry states retain the page title and content region. Honour reduced motion. Avoid decorative images, gradients and invented metrics.

## Contract boundaries

The checked-in frontend generated snapshot still has role-specific QR links. Backend source contracts are ahead of that snapshot and already describe a single visit QR and device takeover. Coordinate that migration with Evan; do not silently substitute frontend session semantics. Browser mocks share data only on the same origin/browser. There is no production staff authentication, live cross-device transport, or verified latency claim. Do not change clinical pathways or routing rules in this design change.

## Research

Better Design UI hierarchy and UX form-disclosure/recoverable-error guidance informed the composition. NHS principles support context, inclusion, trust and simplifying the whole journey: https://service-manual.nhs.uk/design-system/design-principles . W3C WCAG 2.2 guidance supports visible focus and adequate targets: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ . These are design references, not evidence of clinical validation or a completed accessibility audit.

## Verification and remaining integration work

- Tested at 390, 834, 1440 and 1728px. Browser review includes patient home/questions/urgent response; staff worklist, visit, acknowledgement, assessment and completion; empty and failed worklist. Axe checks and horizontal-overflow checks accompany visual inspection. This is not a clinical or comprehensive accessibility certification.
- Browser rehearsal: companion reports speech change; another tab receives the task; staff acknowledge and choose a disposition; completed task leaves the list. Original CTAS and clinical queue order remain unchanged. This verifies same-browser mocks, not phone-to-iPad delivery.
- Better Design principles, copy, structure and DOM spacing tools were used. The next-action copy passed. Generic full-screen copy budgets flag the required four always-visible patient controls and worklist filters. Keep those domain requirements; distinguish them with hierarchy. The structure tool incorrectly treats the complete named-export module as an excerpt and demands Sidebar/StatCard/Table components that this repo does not contain. Do not install an unrelated kit to satisfy that rubric. Spacing review found small link targets, which were expanded; remaining findings include intentional auto margins, screen-reader-only labels, and generic density defaults. No Better Design approval score is claimed.
- Independent review corrected per-task disposition reset, false completion wording, mobile DOM/focus order and missing skip-link targets. Mock physician actions now identify the selected demo role; this remains entirely separate from real authorization.
- **Existing upstream freshness failure:** `check:contract` fails on untouched origin/main a645c2a inputs. Backend Python contracts and question-bank sources already include the new single-link session model and bank version 2026-11-08.1, while committed web generated files remain on the earlier model/version. All four generated files were compared against origin/main and are unchanged by this branch. Regenerating exposes session/enrolment shape changes and requires coordinated migration of exchange, enrolment, check-in and mocks. This branch deliberately retains the working checked-in frontend snapshot; it is not ready for the new backend session contract.
- No real staff authentication, cross-device service, approved escalation deadlines, or measured five-second live-delivery claim is introduced.
