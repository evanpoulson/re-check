# Recheck web

The React, Vite, TypeScript and Tailwind front end for patient check-in and staff review. [`docs/design/review-flow.md`](../docs/design/review-flow.md) has the current visual guidelines.

## Run it

```sh
npm install
npm run dev
```

Open the address that Vite shows, usually http://localhost:5173.

By default, the app uses typed in-memory mocks (`src/api/mocks`) that use the real question bank. You do not need the API. The mocks keep their state in `localStorage`. Thus a nurse tab and a patient tab on the same address see the same visits. To reset the demo, clear the site data.

To use the real API, set `VITE_USE_MOCKS=false`. The mocks then do not load. Vite sends `/api` to FastAPI at `RECHECK_API_URL` (default `http://127.0.0.1:8000`). The Docker image always builds with the mocks off.

## Try the loop with the mocks

1. Open `/` and choose **Triage nurse** in the demo role picker.
2. Select **New visit**. Choose a CTAS level and a complaint, or type a CEDIS code (try `402`, `003` or `351`).
   - A mapped code locks the complaint group.
   - An excluded complaint selects "app not offered".
3. Create the visit. One QR code appears. It encodes a link such as `/v/<token>`.
4. Open the link in a second tab, or scan it with a phone on the same network. Choose patient or companion.
5. Answer a check-in, do the circle check, or use one of the buttons that are always visible.
6. Go back to the **Triage board**. The flag shows as a badge. The place-in-line number does not change, because the queue stays in CTAS order, then arrival order.
7. Open the visit. Select **Acknowledge**, then **Record assessment**. These are two separate steps.
8. To sign the patient out, select **Stop offering the app**.

The mocks have seeded visits, so you can skip enrolment. Each link opens one time in each browser.

| Case | Link |
| --- | --- |
| Worsening chest pain, CTAS 2, red flag | `/v/demo-chest-token` |
| Calm general visit, CTAS 3, no flag | `/v/demo-general-token` |
| Head injury, CTAS 3, missed check-in (silent) | `/v/demo-head-token` |
| Confused or drowsy, CTAS 3, check-in by companion only | `/v/demo-confused-token` |
| Child, CTAS 4, app not offered | no QR |

For the "new speech change on an unrelated complaint" case, sign in as companion on the general visit. Then report "Speech is different or hard to understand".

### Physician worklist

Choose **Physician** or **Charge nurse** in the role picker, then open `/staff/physician`. The worklist uses the rank from the server, which is independent of the triage board.

1. Open a concern and acknowledge it.
2. Choose an assessment outcome. The completed task goes off the worklist.

Filters, search, refresh and retry work. The visit disclosure has the secondary vitals and visit actions.

In the mocks, the selected role is only for demo navigation. The real app gets identity and permissions from the server session.

## Routes

| Route | Who |
| --- | --- |
| `/staff/sign-in` | anyone |
| `/staff/physician` | physician, charge nurse |
| `/staff/triage`, `/staff/visits/new` | triage nurse, charge nurse |
| `/staff/visits/:id` (tabs: overview, `assessment`, `timeline`, `manage`) | signed-in staff |
| `/v/:token` | QR holder |
| `/check-in` | signed-in device |

`src/routes.tsx` is the source of truth. The charge nurse escalation and handover screens are not built yet. The API routes for them exist (see [`api/README.md`](../api/README.md#routes)).

## Checks

```sh
npm run typecheck && npm run lint && npm test && npm run build && npm run check:contract
```

## Generated files

`npm run gen:contract` copies from the back end everything that the back end owns:

- `src/api/contract.d.ts` and `contract.schema.json`, from the Pydantic models in `api/src/recheck/contract`. This step needs [uv](https://docs.astral.sh/uv/).
- `src/api/bank/questionnaire.json` and `cedis-groups.json`, copies of `question-bank/`.

Do not edit these files. Commit the output. A second run must not change them. If they are out of date, `npm run check:contract` fails. The mocks and the screens use these types, so a contract change fails the type check where it has an effect.

These files mirror back-end logic by hand:

| File | Mirrors |
| --- | --- |
| `src/api/bank.ts` | Question wording, companion wording, options, "Not sure" rules and circle-check settings, read from the bank |
| `src/api/cedis.ts` | The CEDIS codes and `check_enrolment()` |
| `src/api/enableWhen.ts` | The branching. Only the mocks and the tests use it. The screens show what the API returns. |
| `src/lib/findings.ts` | The urgent findings in `rules.py` |

The contract has no HTTP paths. `src/api/endpoints.ts` holds them. Keep it the same as the FastAPI routes.

## Notes

- The patient screens have 14 languages in addition to English. The interface text is in `src/i18n/<code>.json`. The question wording is in `question-bank/translations/`. These are drafts that nobody has reviewed, so patients see a notice. Staff screens stay in English, and staff always see answers in English. Arabic and Urdu set the page to right to left.
- The mocks are demo logic, not the rules engine.
- The font (Atkinson Hyperlegible Next) comes from `@fontsource-variable` and is part of the build. Thus the app works offline and sends no requests to other servers.
