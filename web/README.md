# Recheck web

React, Vite, TypeScript and Tailwind front end for patient check-in and staff review. Current visual guidelines and verification notes: [`docs/design/review-flow.md`](../docs/design/review-flow.md). The older frontend document is provisional.

## Run it

```sh
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). By default the app runs against typed in-memory mocks (`src/api/mocks`) built on the real question bank, so no backend is needed. State is saved in the browser, so a nurse tab and a patient tab on the same address see the same visits. Clear site data to reset the demo.

### Try the loop

1. Open `/`, which goes to `/staff/sign-in`, and choose **Triage nurse** from the demo roles. The mocks offer only the demo picker; with the real API, staff sign in with Auth0.
2. **New visit**: pick a CTAS level and complaint, or type a CEDIS code (try `402`, `003` or `351`). A mapped code locks the complaint group, and an excluded complaint pre-selects "app not offered". Create it. One QR code appears, encoding a link such as `/v/<token>`, with **Copy link**, **Print**, **Save QR** (an SVG) and **Open visit**, plus when the first check-in and staff reassessment are due. Whoever scans it chooses patient or companion. The triage nurse or charge nurse can show the same QR again from the visit's **Visit management** tab.
3. Open the QR link in a second tab, choose **Patient** (or scan it with a phone on the same network). Answer a check-in, play the circle check, or use any of the four always-visible buttons.
4. Back on the **Triage board**, the flag appears as a level chip, with a coloured bar on the row's left edge. The place-in-line numeral on the left does not change: the queue stays in CTAS then arrival order.
5. Click the patient row to open the visit page. On the **Assessment** tab, **Acknowledge**, then **Record assessment**. Acknowledging and assessing are separate steps. **Stop offering the app** (in the Danger zone on **Visit management**) signs the patient out.

The mocks seed a waiting room of 25 synthetic visits, timed relative to when the state is first created. Clear `localStorage` to reseed. These five are the demo cases. One device is signed in per visit; opening a link on a second device asks to take over.

| Case | QR link (choose patient or companion) |
| --- | --- |
| Worsening chest pain, CTAS 2, already flagged red | `/v/demo-chest-token` |
| Calm general visit, CTAS 3, no flag | `/v/demo-general-token` |
| Head injury, CTAS 3, check-in missed (silent) | `/v/demo-head-token` |
| Confused or drowsy, CTAS 3, companion-only check-in | `/v/demo-confused-token` |
| Child, CTAS 4, app not offered | no QR |

The other 20 fill the board, worklist, Escalations and Handover. Each app visit has a QR link at `/v/demo-<case>-token`. Several already have a device signed in, so scanning asks to take over.

| Case | Level and state |
| --- | --- |
| `breathing`: CTAS 2, new trouble breathing, Tagalog | Red, acknowledged; reassessment overdue |
| `headache`: CTAS 2, headache, pager 214, Spanish | No task |
| `droop`: CTAS 3, arm weakness, companion reports facial droop, Punjabi | Red, escalated to backup |
| `backpain`: CTAS 3, back pain, "I need help now", Mandarin | Red, escalated to backup |
| `flank`: CTAS 3, flank pain, phone went quiet, Arabic | Silent, acknowledged |
| `vomiting`: CTAS 3, vomiting, pager 118, Vietnamese | Amber, acknowledged; check-in overdue |
| `sugar`: CTAS 3, hypoglycemia, companion is worried | Amber, open |
| `cut`: CTAS 3, facial cut, says they are leaving | Leave risk, open |
| `vertigo`: CTAS 3, circle count did not match, Korean | Overdue, open; reassessment overdue |
| Self-harm, CTAS 3 | No task; app not offered |
| Pregnancy over 20 weeks, CTAS 4, Hindi | Amber (flagged higher by staff), acknowledged; app not offered |
| `desk`: CTAS 4, back pain, question for the desk, Punjabi | Overdue, triage nurse only, open |
| `wrist`: CTAS 4, question for the desk, pager 305, Cantonese | Overdue, triage nurse only, acknowledged |
| `tingling`: CTAS 4, tingling hands, says they are leaving, French | Leave risk, acknowledged |
| `neck`: CTAS 4, neck strain, pager 422 | Silent, open; reassessment overdue |
| `ankle`: CTAS 4, triaged 5 minutes ago, pager 131, Spanish | No task |
| `stable`: CTAS 4, assessed stable earlier | No open task; reassessment overdue |
| `rash`: CTAS 5, waiting nearly 5 hours | No task |
| `sore`: CTAS 5, pager 507, Polish | No task; check-in a few minutes overdue (turns silent soon) |
| `migraine`: CTAS 5, headache much worse, Urdu | Amber, acknowledged |

Companion on the general visit, then reporting "Speech is different or hard to understand", is the "new speech change on an unrelated complaint" case.

Set `VITE_USE_MOCKS=false` to call a real backend instead. The mocks then do not load.

## Checks

```sh
npm run typecheck && npm run lint && npm test && npm run build && npm run check:contract
```

## Everything the backend owns is copied, not retyped

`npm run gen:contract` generates from the backend:

- `src/api/contract.d.ts` and `contract.schema.json`, from the Pydantic models in `api/src/recheck/contract` (needs [uv](https://docs.astral.sh/uv/)).
- `src/api/bank/questionnaire.json` and `cedis-groups.json`, copies of `question-bank/`.

Do not edit them. Commit the outputs; running it again must not change them. `npm run check:contract` fails if they are out of date. Mocks and screens are typed by these types, so a contract change fails the type check where it matters.

- `src/api/bank.ts` reads question wording, companion wording, options, "Not sure" rules and circle-check settings from the bank.
- `src/api/cedis.ts` lists the CEDIS codes and mirrors the backend's `check_enrolment()`.
- `src/api/enableWhen.ts` mirrors the backend's branching. The mock server and tests use it; screens render what the API returns.

The contract defines no HTTP paths. `src/api/endpoints.ts` holds proposed ones; confirm them against the FastAPI routes when they exist.

## Routes

`/staff/sign-in`, `/staff/escalations`, `/staff/escalations/handover`, `/staff/physician`, `/staff/triage`, `/staff/visits/new`, `/staff/visits/:id` (with `/assessment`, `/timeline` and `/manage` tabs), `/v/:token`, `/check-in`. They match `docs/recheck-project-plan.md`.

Each role has a home: the triage nurse `/staff/triage`, the physician `/staff/physician` and the charge nurse `/staff/escalations`. The charge nurse can also open the triage board, New visit and the physician worklist.

## Notes

- Patient screens are translated into 14 languages besides English: interface strings in `src/i18n/<code>.json` and question wording in `question-bank/translations/`. They are unreviewed drafts, so patients see a notice. `src/i18n/keys.test.ts` fails if a key a patient screen uses is missing from any of the 15 languages, or has different placeholders or plural forms. Staff screens stay in English, and staff always see answers in English. Arabic and Urdu set the page to right to left.
- The mocks are demo logic, not the rules engine. Task levels they assume where the contract is silent (a desk question, a wrong circle count) are listed in the design doc.
- The app loads no web font. `--font-sans` in `src/index.css` is the system stack (SF Pro on Apple devices, Segoe UI on Windows, then `system-ui`), so it makes no font request. "Noto Sans Gurmukhi" is named in the stack but not shipped, so Punjabi uses whatever the device has.
- Text sizes use one rem scale in `src/index.css`: `text-note`, `text-small`, `text-base`, `text-lead`, `text-title`, `text-heading` and `text-display` (13 to 40 px). Tailwind's default sizes are switched off.

## Physician demo

Choose **Physician** in the demo role picker, or open `/staff/physician` after choosing a role. The worklist ranks active review tasks using the supplied server rank, independently of the triage board. Open a concern, acknowledge it, then choose an assessment outcome. A completed task disappears from the worklist. Filters, search, refresh and retry are functional. The physician's visit page has Overview, Assessment and Timeline tabs. Vitals and Visit management are for the triage nurse and charge nurse.

## Charge nurse demo

Choose **Charge nurse**. The home is `/staff/escalations`, with **Escalations** and **Handover** tabs. In the mocks, the seeded chest-pain task is routed to the backup once its acknowledgement deadline passes. On a visit, the charge nurse can acknowledge any task, assess a task routed to the charge nurse (escalated tasks are), record vitals and use Visit management. Flag higher is not shown, because the API allows only the triage nurse to flag.

The selected role is demo navigation only. Browser mocks attribute physician acknowledgements and assessments to that role; production must derive identity and permissions from the authenticated server session.
