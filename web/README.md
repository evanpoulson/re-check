# Recheck web

React, Vite, TypeScript and Tailwind front end for patient check-in and staff review. Current visual guidelines and verification notes: [`docs/design/review-flow.md`](../docs/design/review-flow.md). The older frontend document is provisional.

## Run it

```sh
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). There is no backend yet, so the app runs against typed in-memory mocks (`src/api/mocks`) built on the real question bank. State is saved in the browser, so a nurse tab and a patient tab on the same address see the same visits. Clear site data to reset the demo.

### Try the loop

1. Open `/` and choose **Triage nurse** (a labelled demo role picker; there is no real sign-in yet).
2. **New visit**: pick a CTAS level and complaint, or type a CEDIS code (try `402`, `003` or `351`). A mapped code locks the complaint group, and an excluded complaint pre-selects "app not offered". Create it. Two QR codes appear, once. Each QR encodes a link such as `/v/<token>`.
3. Open the **Patient** link in a second tab (or scan it with a phone on the same network). Answer a check-in, play the circle check, or use any of the four always-visible buttons.
4. Back on the **Triage board**, the flag appears as a badge. The place-in-line numeral on the left does not change: the queue stays in CTAS then arrival order.
5. Open the patient row, **Acknowledge**, then **Record assessment**. Acknowledging and assessing are separate steps. **Stop offering the app** signs the patient out.

Seeded demo patients, if you want to skip enrolment (each code opens once per browser):

| Case | Patient link | Companion link |
| --- | --- | --- |
| Worsening chest pain, CTAS 2, already flagged red | `/v/demo-patient-chest-token` | `/v/demo-companion-chest-token` |
| Calm general visit, CTAS 3, no flag | `/v/demo-patient-general-token` | `/v/demo-companion-general-token` |
| Head injury, CTAS 3, check-in missed (silent) | `/v/demo-patient-head-token` | `/v/demo-companion-head-token` |
| Confused or drowsy, CTAS 3, companion-only check-in | `/v/demo-patient-confused-token` | `/v/demo-companion-confused-token` |
| Child, CTAS 4, app not offered | no QR | no QR |

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

`/staff/sign-in`, `/staff/physician`, `/staff/triage`, `/staff/visits/new`, `/staff/visits/:id`, `/v/:token`, `/check-in`. They match `docs/recheck-project-plan.md`.

## Notes

- The question bank is English only. Punjabi (`pa`) and Tagalog (`tl`) show a notice and fall back to English until translations are supplied.
- The mocks are demo logic, not the rules engine. Task levels they assume where the contract is silent (a desk question, a wrong circle count) are listed in the design doc.
- The font (Atkinson Hyperlegible Next) is self-hosted through `@fontsource-variable`, so the app works offline and makes no third-party request.

## Physician demo

Choose **Physician** in the demo role picker, or open `/staff/physician` after choosing a role. The worklist ranks active review tasks using the supplied server rank, independently of the triage board. Open a concern, acknowledge it, then choose an assessment outcome. A completed task disappears from the worklist. Filters, search, refresh and retry are functional. Secondary vitals and visit-management actions are available in the visit's disclosure.

The selected role is demo navigation only. Browser mocks attribute physician acknowledgements and assessments to that role; production must derive identity and permissions from the authenticated server session.
