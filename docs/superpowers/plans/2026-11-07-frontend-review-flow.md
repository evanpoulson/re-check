# Frontend review flow implementation plan

Goal: Deliver three composed screens for the synthetic demo: check-in, physician worklist, visit assessment.
Architecture: Retain React Query, the generated contract, question bank, browser mocks, and shared React primitives. Add the missing physician route; restructure patient and visit presentation. No clinical policy or backend contract changes.
Tech stack: React, TypeScript, Tailwind, Lucide, Vite.
Spec: User frontend handoff; docs/design/review-flow.md.

The user requested one-shot execution, so scope and visual decisions are made here without an approval round. Work starts at a645c2a on codex/frontend-review-flow; local main remains untouched.

- [x] Verify baseline and capture existing patient and visit screens.
- [x] Add integration coverage for physician list, filtering and assessment lifecycle; observe failure.
- [x] Build a quiet shared shell and primitives; physician list uses server rank, reasons, recipients and independent deadlines.
- [x] Restructure visit around concern and next action; preserve all metadata and actions in disclosures.
- [x] Refine patient home, question and feedback states; preserve question wording and always-visible help.
- [x] Run frontend checks, browser loop and responsive/state review; document limits and reusable guidelines.
- [ ] Review branch, commit and open PR for user approval; never merge.

Review focus: no clinical queue reordering; no completed assessment implied by acknowledgement; no stale dashboard after actions; no invented person identity or live service claims; no patient controls obscured by fixed help.

Validation: original 128 tests pass; new review-flow tests cover sorting, filtering, explicit disposition, subsequent tasks and demo attribution. Browser loop/axe checks recorded in docs/design/review-flow.md. Contract freshness is an inherited failure verified against origin/main; no generated contract changes are included.
