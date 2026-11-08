# Recheck web

The React, Vite, TypeScript and Tailwind front end for patient check-in and staff review.

- [`docs/design/frontend.md`](../docs/design/frontend.md) has the frontend design.
- [`docs/design/review-flow.md`](../docs/design/review-flow.md) has the current visual guidelines.

## Run it

```sh
npm install
npm run dev
```

Open the address that Vite shows, usually http://localhost:5173.

By default, the app uses typed in-memory mocks (`src/api/mocks`) that use the real question bank. You do not need the API. The mocks keep their state in `localStorage`. Thus a nurse tab and a patient tab on the same address see the same visits. To reset the demo, clear the site data.

To use the real API, set `VITE_USE_MOCKS=false`. The mocks then do not load. Vite sends `/api` to FastAPI at `RECHECK_API_URL` (default `http://127.0.0.1:8000`). The Docker image always builds with the mocks off.

## Try the loop with the mocks

1. Open `/`. It goes to `/staff/sign-in`. Choose **Triage nurse** from the demo roles. The mocks show only the demo picker. With the real API, staff sign in with Auth0.
2. On the triage board, select **New visit**. It opens as a sheet over the board. Choose a CTAS level and a complaint, or type a CEDIS code (try `402`, `003` or `351`).
   - A mapped code locks the complaint group.
   - An excluded complaint selects "app not offered".
3. Create the visit. One QR code appears. It encodes a link such as `/v/<token>`. The card has **Copy link**, **Print**, **Save QR** (an SVG) and **Open visit**. It also shows when the first check-in and the staff reassessment are due.
4. Open the link in a second tab, or scan it with a phone on the same network. Choose **Patient**.
5. Answer a check-in, do the circle check, or use one of the four buttons that are always visible.
6. Go back to the **Triage board**. The flag shows as a level chip, with a coloured bar on the left edge of the row. The place-in-line number does not change, because the queue stays in CTAS order, then arrival order.
7. Select the patient row to open the visit page. On the **Assessment** tab, select **Acknowledge**, then **Record assessment**. These are two separate steps.
8. To sign the patient out, go to **Visit management** and select **Stop offering the app** in the Danger zone.

The triage nurse or the charge nurse can show the same QR again from the **Visit management** tab.

### Seeded visits

The mocks make a waiting room of 25 synthetic visits. The times are relative to the time when the mocks first make their state. To make the visits again, clear `localStorage`.

Only one device can be signed in for each visit. If you open a link on a second device, it asks to take over. These five visits are the demo cases:

| Case | QR link (choose patient or companion) |
| --- | --- |
| Worsening chest pain, CTAS 2, red flag | `/v/demo-chest-token` |
| Calm general visit, CTAS 3, no flag | `/v/demo-general-token` |
| Head injury, CTAS 3, missed check-in (silent) | `/v/demo-head-token` |
| Confused or drowsy, CTAS 3, check-in by companion only | `/v/demo-confused-token` |
| Child, CTAS 4, app not offered | no QR |

For the "new speech change on an unrelated complaint" case, sign in as companion on the general visit. Then report "Speech is different or hard to understand".

The other 20 visits fill the board, the worklist, Escalations and Handover. Each app visit has a QR link at `/v/demo-<case>-token`. Some of these visits already have a signed-in device, so a scan asks to take over.

| Case | Level and state |
| --- | --- |
| `breathing`: CTAS 2, new trouble breathing, Tagalog | Red, acknowledged. Reassessment overdue. |
| `headache`: CTAS 2, headache, pager 214, Spanish | No task |
| `droop`: CTAS 3, arm weakness, companion reports facial droop, Punjabi | Red, escalated to backup |
| `backpain`: CTAS 3, back pain, "I need help now", Mandarin | Red, escalated to backup |
| `flank`: CTAS 3, flank pain, phone went quiet, Arabic | Silent, acknowledged |
| `vomiting`: CTAS 3, vomiting, pager 118, Vietnamese | Amber, acknowledged. Check-in overdue. |
| `sugar`: CTAS 3, hypoglycemia, companion is worried | Amber, open |
| `cut`: CTAS 3, facial cut, says they are leaving | Leave risk, open |
| `vertigo`: CTAS 3, circle count did not match, Korean | Overdue, open. Reassessment overdue. |
| Self-harm, CTAS 3 | No task. App not offered. |
| Pregnancy over 20 weeks, CTAS 4, Hindi | Amber (flagged higher by staff), acknowledged. App not offered. |
| `desk`: CTAS 4, back pain, question for the desk, Punjabi | Overdue, triage nurse only, open |
| `wrist`: CTAS 4, question for the desk, pager 305, Cantonese | Overdue, triage nurse only, acknowledged |
| `tingling`: CTAS 4, tingling hands, says they are leaving, French | Leave risk, acknowledged |
| `neck`: CTAS 4, neck strain, pager 422 | Silent, open. Reassessment overdue. |
| `ankle`: CTAS 4, triaged 5 minutes ago, pager 131, Spanish | No task |
| `stable`: CTAS 4, assessed stable before | No open task. Reassessment overdue. |
| `rash`: CTAS 5, waiting almost 5 hours | No task |
| `sore`: CTAS 5, pager 507, Polish | No task. Check-in a few minutes overdue (becomes silent soon). |
| `migraine`: CTAS 5, headache much worse, Urdu | Amber, acknowledged |

### Physician worklist

Choose **Physician** in the role picker. The home is `/staff/physician`. The worklist uses the rank from the server, which is independent of the triage board.

1. Open a concern and acknowledge it.
2. Choose an assessment outcome. The completed task goes off the worklist.

Filters, search, refresh and retry work. The visit page of the physician has the Overview, Assessment and Timeline tabs. Vitals and Visit management are for the triage nurse and the charge nurse.

### Charge nurse

Choose **Charge nurse**. The home is `/staff/escalations`, with the **Escalations** and **Handover** tabs.

- In the mocks, the seeded chest-pain task goes to the backup when its acknowledgement deadline passes.
- On a visit, the charge nurse can acknowledge all tasks, and assess the tasks that go to the charge nurse. Escalated tasks go to the charge nurse.
- The charge nurse can record vitals and use Visit management.
- The charge nurse does not see **Flag higher**, because the API lets only the triage nurse flag.

In the mocks, the selected role is only for demo navigation. The real app gets identity and permissions from the server session.

## Routes

| Route | Who |
| --- | --- |
| `/staff/sign-in` | anyone |
| `/staff/escalations`, `/staff/escalations/handover` | charge nurse |
| `/staff/physician` | physician, charge nurse |
| `/staff/triage` (New visit opens with `?panel=new-visit`) | triage nurse, charge nurse |
| `/staff/visits/new` | goes to the New visit sheet on the triage board |
| `/staff/visits/:id` (tabs: overview, `assessment`, `timeline`, `manage`) | signed-in staff |
| `/v/:token` | QR holder |
| `/check-in` | signed-in device |

`src/routes.tsx` is the source of truth. Each role has a home: `/staff/triage` for the triage nurse, `/staff/physician` for the physician, and `/staff/escalations` for the charge nurse.

## Check-in reminders

- **Turn on.** The patient home shows "Turn on reminders" when the API has a Web Push key (`GET /api/patient/push`).
- **Service worker.** `public/sw.js` shows the reminder. A tap opens `/check-in`. The app registers the service worker only when a person turns on reminders.
- **iPhone.** iPhones need the page on the Home Screen for reminders (iOS 16.4+). `public/manifest.webmanifest` permits this. In a Safari tab, an iPhone shows these steps instead.
- **Mocks.** The app never registers `sw.js` with the mocks, because the mock service worker uses the same scope. The mock API reports reminders as off.
- **Page open.** When a check-in becomes due on an open page, the page plays a chime (after the first tap). It also vibrates on Android and flashes the tab title (`src/lib/dueAlert.ts`).

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

- **Languages.** The patient screens have 14 languages in addition to English. The interface text is in `src/i18n/<code>.json`. The question wording is in `question-bank/translations/`. These are drafts that nobody has reviewed, so patients see a notice. Staff screens stay in English, and staff always see answers in English. Arabic and Urdu set the page to right to left.
- **Translation test.** `src/i18n/keys.test.ts` fails if one of the 15 languages does not have a key that a patient screen uses. It also fails if the placeholders or plural forms are different.
- **Mocks.** The mocks are demo logic, not the rules engine.
- **Font.** The app loads no web font. `--font-sans` in `src/index.css` is the system stack: SF Pro on Apple devices, Segoe UI on Windows, then `system-ui`. The stack names "Noto Sans Gurmukhi", but the app does not include it. Punjabi uses the font of the device.
- **Text sizes.** All sizes use one rem scale in `src/index.css`: `text-note`, `text-small`, `text-base`, `text-lead`, `text-title`, `text-heading` and `text-display` (13 to 40 px). The default Tailwind sizes are off.
