# Recheck web

React, Vite, TypeScript and Tailwind front end for the triage nurse and patient screens. Design: [`docs/design/frontend.md`](../docs/design/frontend.md).

## Run it

```sh
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). There is no backend yet, so the app runs against typed in-memory mocks (`src/api/mocks`). State is saved in the browser, so a nurse tab and a patient tab on the same address see the same visits. Clear site data to reset the demo.

### Try the loop

1. Open `/` and choose **Triage nurse** (a labelled demo role picker; there is no real sign-in yet).
2. **New visit**: pick a CTAS level and complaint and create it. Two QR codes appear, once. Each QR encodes a link such as `/v/<token>`.
3. Open the **Patient** link in a second tab (or scan it with a phone on the same network). Answer a check-in, or tap **I need help now**.
4. Back on the **Triage board**, the flag appears as a badge. The row does not move: the queue stays in CTAS then arrival order.
5. Open the patient row, **Acknowledge**, then **Record assessment**. Acknowledging and assessing are separate steps.

Seeded demo patients, if you want to skip enrolment (each code opens once per browser):

| Case | Patient link | Companion link |
| --- | --- | --- |
| Worsening chest pain, CTAS 2, already flagged red | `/v/demo-patient-chest-token` | `/v/demo-companion-chest-token` |
| Calm general visit, CTAS 3, no flag | `/v/demo-patient-general-token` | `/v/demo-companion-general-token` |
| Head injury, CTAS 3, check-in missed (silent) | `/v/demo-patient-head-token` | `/v/demo-companion-head-token` |

Companion on the general visit, then reporting "Speech is suddenly different", is the "new speech change on an unrelated complaint" case.

Set `VITE_USE_MOCKS=false` to call a real backend instead.

## Checks

```sh
npm run typecheck && npm run lint && npm test && npm run build
```

## API types come from the backend

`src/api/contract.d.ts` is generated from the Pydantic models in `api/src/recheck/contract`. Do not edit it. After a backend contract change:

```sh
npm run gen:contract
```

This needs [uv](https://docs.astral.sh/uv/) and runs the backend's `contract_json_schema()`. Commit `contract.schema.json` and `contract.d.ts`. Running it again must not change them. Mocks and screens are typed by these types, so a contract change fails the type check where it matters.

The contract defines no HTTP paths. `src/api/endpoints.ts` holds proposed ones; confirm them against the FastAPI routes when they exist.

## Routes

`/staff/sign-in`, `/staff/triage`, `/staff/visits/new`, `/staff/visits/:id`, `/v/:token`, `/check-in`. They match `docs/recheck-project-plan.md`.

## Notes

- Punjabi (`pa`) and Tagalog (`tl`) strings are empty and fall back to English until translations are supplied.
- The mocks are demo logic, not the rules engine. Thresholds in them are demo values.
