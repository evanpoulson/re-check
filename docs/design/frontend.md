# Recheck frontend design

Design and layout for the two screens this document covers: the **triage nurse** (desktop web) and the **patient or companion** (mobile web). The physician worklist and charge-nurse escalation screens are separate workstreams in the [project plan](../recheck-project-plan.md).

1. **Triage nurse.** The nurse enrols the patient with exactly the fields in [`db/schema.sql`](../../db/schema.sql), the source of truth. The app issues a unique QR for that visit. The nurse then watches a dashboard of every waiting patient (condition, flags, time since last check-in, symptoms) and acts.
2. **Patient or companion.** Scanning the QR opens a check-in tied to that visit, with no install and no account. Reminders follow the CTAS schedule and the questions follow the initial complaint. A concern can be reported at any time.

Answers change a patient's **condition and flags**, never their **queue position**. The nurse stays in control. Missed check-ins are flagged after one or two misses.

Sources: [`AGENTS.md`](../../AGENTS.md), the [project plan](../recheck-project-plan.md), the [research brief](../research/recheck-waiting-room.md), the [API contract](../../api/README.md) and the schema.

## Decisions

- The patient is in the queue from **enrolment**. Scanning the QR signs in one device as the patient or the companion; the nurse sees Patient signed in, Companion signed in or No one signed in.
- The dashboard keeps **fixed queue order**. Flags are badges and never move a row.
- Staff use a clearly labelled **demo role picker** until sign-in is ready. Auth0 is optional later.
- Calm clinical light theme, desktop-first staff UI, shadcn/ui with Radix, languages `en`, `pa`, `tl`.

## Routes

These match the routes proposed in the [project plan](../recheck-project-plan.md).

| Screen | Route | Notes |
| --- | --- | --- |
| Demo role picker | `/staff/sign-in` | Labelled synthetic demo |
| Nurse enrolment | `/staff/visits/new` | CTAS 2 to 5, complaint, language, channel. One QR card, which the desk can show again |
| Nurse triage board | `/staff/triage` | All waiting patients, flags, conditions |
| Visit timeline | `/staff/visits/:id` | Reusable sheet or page, shared with the physician view |
| Patient and companion | `/v/:token`, then `/check-in` | The token exchange sets the session, then redirects |

## Design principles

1. **Urgent is never blocked.** "I need help now" and "I'm worried" are on every patient screen. A finding routes as soon as it is submitted, even from a partial check-in. Follow-ups come after (`ReportReceipt.follow_up_items`).
2. **Honest answers.** Every answer is a value or a missing reason (`unsure`, `unable_to_respond`, `not_asked`, `not_reached`). These look different and are never shown as "no" or "all clear". A reassuring answer never hides an open concern.
3. **Queue position is the nurse's.** Every patient screen says "Your answers never change your place in line." The dashboard never reorders rows on its own.
4. **Two clocks, separate steps.** The patient prompt timer (`next_prompt_due_at`) and the staff reassessment timer (`staff_reassess_due_at`) are shown separately. Created, delivered, acknowledged and assessed are separate task steps.
5. **Quiet by default.** Neutral UI. Colour marks state and is always paired with an icon and text.
6. **Accessible and private.** Touch targets of 48px or more, plain language, screen-reader labels, no name or health number anywhere, and a visible "What we store" panel.
7. **Label demo data.** A persistent "Synthetic data, demo thresholds" badge in the nurse chrome.

## Design system

- **Tokens** (CSS variables in the Tailwind theme): neutral slate surfaces and one calm teal-blue primary. Task-level colours map 1:1 to `TaskLevel`: `red`, `amber`, `silent` (violet with a clock icon), `leave_risk` (orange with a door icon) and `overdue` (blue-grey with an hourglass). There is no bright green for "fine"; baseline is muted grey.
- **Type:** Inter or system. Patient body text 18px or larger and answer buttons 20px. The nurse table uses 14px with tabular numerals for timers.
- **shadcn/ui and Radix:** Button, Card, Badge, Table, Sheet, Dialog, Tabs, Toast, Tooltip, Progress, RadioGroup, Select, Slider, Skeleton.
- **Custom components:** `AnswerButton`, `HelpBar`, `LevelChip`, `StateChip` (condition), `MissedChip`, `LinkChip` (Patient signed in, Companion signed in or No one signed in), `CountdownChip`, `Sparkline`, `Timeline`, `QrCard`, `PrivacyPanel`.

## Triage nurse side

### Enrolment (`/staff/visits/new`, maps to `VisitCreate`)

Fields exactly as the contract and schema:

- `ctas` 2 to 5 as a segmented control. CTAS 1 is disabled with "never in the waiting room".
- `complaint_group`: `chest_back_pain`, `neuro_change`, `head_injury`, `confused_drowsy` or `general`. With a CEDIS code, the server rejects a group the [CEDIS map](../../question-bank/cedis-groups.json) contradicts.
- `app_exclusion` (optional): child, pregnancy over 20 weeks, self-harm or violence, or major trauma. An excluded visit gets no channel and no QR, and stays on the staff list.
- Optional 3-digit `cedis_code`.
- `language`: `en`, `pa` or `tl`.
- `channel`: phone or pager. `pager_no` (1 to 6 digits) appears only for pager. A pager already bound to a waiting patient is rejected by the schema, so show the server error inline.
- A client `submission_id` is generated once and reused on retry.

After submit (`VisitEnrolled`), show one QR card (`link`) with Print and Save. The code has no expiry: it works while the visit is waiting and stops when the visit closes. The same code serves the patient and the companion: whoever scans it chooses who they are. Only one device is signed in at a time. To switch people or phones, the nurse opens the visit and taps **Show QR**, which fetches `VisitLink` (the same code again). Also show when the first prompt and the staff reassessment are due (CTAS demo defaults of 15, 30, 60 and 120 minutes). For pager patients, the same QR is the phone fallback.

```
+--------------------------------------------------------------+
| New visit                                  [Synthetic data]  |
| CTAS      ( 2 )( 3 )( 4 )( 5 )   1 = not in waiting room     |
| Complaint [ Chest/back pain  v ]   CEDIS [ ___ ] (optional)  |
| Language  [ English v ]   Channel (o) Phone  ( ) Pager [ # ] |
|                                          [ Create visit ]    |
+--------------------------------------------------------------+
   after submit:
+--------------------------+
|        [ VISIT QR ]      |  Patient or companion scans.
|  Scan to check in        |  Works while waiting
|  [Print] [Save]          |  First check-in 14:15
+--------------------------+  Show again from the visit.
```

### Triage board (`/staff/triage`, fixed queue order)

Rows keep **queue order (CTAS, then `triaged_at`)** and are never re-sorted automatically. The nurse can sort manually. A flag adds a badge and a soft row highlight and raises the header counts, but never moves the row. The header shows counts per Red, Amber, Silent, Leave risk and Overdue, a "Needs review" filter chip, filters for CTAS and complaint, and a Live or Reconnecting indicator.

Columns:

- Visit ref (pager number or short ref), CTAS, complaint group, language and channel.
- **Waiting time** since `triaged_at`.
- **Condition** (`StateChip`): the last check-in `feeling_change` (much better to much worse, or unknown) plus the latest findings.
- **Flags:** `LevelChip` for the open task level, `MissedChip` ("Missed 1" or "Missed 2+"), prompt overdue, reassessment overdue and `LinkChip`.
- **Time since last check-in**, with who answered (patient or companion) and the channel.
- **Next check-in due** and **staff reassessment due** as two separate countdowns.
- **Symptoms:** the latest pain and reported findings, plus a `Sparkline` of the trend. An unanswered point is a gap, never a zero.

```
+---------------------------------------------------------------------------------+
| Triage board     (Red 1) (Amber 2) (Silent 1) (Leave 0) (Overdue 1)   o Live    |
| [Needs review] [CTAS v] [Complaint v]            Order: queue (CTAS, arrival)   |
|---------------------------------------------------------------------------------|
| Ref   CTAS Complaint   Wait  Condition  Flags          Last chk  Next | Reassess |
| P-21   2   Chest/back  0:42  WORSE      RED  !         3m (pt)   12m  | 0:03     |
| P-14   3   Head injury 1:10  Same       SILENT Missed2 48m (--)  due  | 0:20     |
| P-09   3   General     0:55  Better     Not connected  --        --   | 0:35     |
+---------------------------------------------------------------------------------+
   row click opens the detail sheet
```

### Visit detail sheet (`/staff/visits/:id`)

- A header with every visit field and the open task level.
- **Why flagged:** each `TaskReason` with rule id and version, reason code and linked evidence.
- The two timers and the last staff check.
- A **timeline** of reports, vitals, staff flags and task events. Corrections appear as new entries.
- The latest answers, with missing reasons preserved.
- **Actions**, with the nurse in control:
  - Acknowledge ("I've seen this"), separate from assessment.
  - Assess and complete with a `Disposition`: `assessed_stable`, `tests_ordered`, `re_triaged`, `roomed`, `treated_and_released`, `left_before_assessment` or `not_located`.
  - Record vitals (`VitalsCreate`): sbp and dbp together, hr, rr, spo2, temp_c, `measured_at`, and an optional `supersedes` to correct an earlier entry.
  - **Flag higher** with an optional note of up to 280 characters.
  - Update visit status: roomed, left or discharged.

### Missed check-ins

After one or two missed prompts the row shows "No response" with a distinct reason (unable to respond, not reached or not connected) and the `silent` level. The one-or-two threshold is a server rule. The UI renders what the API returns.

### Live updates

Subscribe to `DashboardEvent` and refetch the affected view, since events are change notices only. The transport is an open backend choice, so wrap it in one `useDashboardEvents()` hook with a polling fallback.

## Patient and companion side (`/v/:token`, then `/check-in`)

After scanning, the person picks **"I'm the patient"** or **"I'm with the patient"**. The `POST` token exchange (`TokenExchange` with `role`) returns `SessionInfo`, and an HttpOnly cookie holds the session. If another device is already signed in, the server answers 409 with `SignInConflict` (who is signed in and since when). Show **"This will sign out the other device"** and, only after the person confirms, resend with `takeover_session_id` from the 409. If someone else took over in the meantime, the server answers 409 again and the person is asked again. Sessions have no timer: they end on takeover, when the person taps **Sign out** (`SignOut`), when staff sign the device out (`StaffSignOut`), or when the visit closes. A signed-out device can't send anything, including reports it queued offline, so it shows "You've been signed out. If you need help now, tell a staff member." and a way to scan again. An unknown token, or one for a visit that has closed, shows "This code is no longer active. Please speak to the triage desk."

Every screen shows the wait range when present, "Your answers never change your place in line.", a language switch, a "What we store" link to the `PrivacyPanel`, and the persistent `HelpBar` (I'm worried, I need help now).

1. **Home and waiting.** Next check-in countdown, "Report a change", "I'm leaving" and the latest `PatientMessage`.
2. **Check-in.** One question per screen, with a progress bar and Back.
   - Wellness: `feeling_now` (very good to very poor) and `feeling_change` (much better to much worse), each with "Not sure" (`missing: unsure`). See the [question bank](../../question-bank/README.md).
   - Pain from 0 to 10 on a slider with word labels, plus "Not sure". **Hidden for a companion** and sent as missing, because the schema forbids companion pain.
   - New warning signs: multi-select over the 13 `FindingCode`s with an explicit "None of these". Companion wording becomes "Are they...".
   - Complaint items from `PatientHome.items` by `input_type` (`yes_no`, `choice`, `multi_choice`, `scale`), each with "Not sure" or "Can't tell".
   - Leaving mid-way submits a **partial** check-in. Unreached items become `not_reached`.
3. **Urgent interstitial.** When a finding or concern returns `clinician_will_check` or `clinician_told`, show a full-screen "Tell a staff member now". It has already been sent. Follow-ups (`follow_up_items`) are optional and come after.
4. **Sent and status.** A patient-safe timeline: Reported, Received, Staff notified. Task level and reasons never reach the patient.
5. **Leaving.** `LeavingReport` with `leaving_info` ("tell staff before you go").
6. **Offline, saved and pending.** Answers queue locally and retry with the same `submission_id`. A clear "Saved, will send when connected" state looks different from "no problem".
7. **Unable to respond.** A "Someone else is answering" or "I can't answer right now" path records `unable_to_respond`.

```
 +----------------------------+     +----------------------------+
 | <  Check-in        2 / 5   |     |  Get help now              |
 | ======-----                |     |  Tell a staff member       |
 | Has the pain moved or      |     |  right away.               |
 | spread somewhere new?      |     |  We have already alerted   |
 | [ Yes ]   [ No ]           |     |  staff.                    |
 | [ Not sure ]               |     |  [ I'm telling staff ]     |
 | Your answers never change  |     +----------------------------+
 | your place in line.        |
 | [ I'm worried ][ HELP NOW ]|   <- HelpBar pinned on every screen
 +----------------------------+
```

## Contract gaps to settle with the backend

1. **The triage board row is too thin.** `BoardRow` has only CTAS, complaint, `triaged_at`, level and the reassessment due and overdue fields. The project plan already says to extend it. The dashboard needs the last report (time, who, channel), `trend`, latest findings, prompt due and overdue, `silent`, `leave_risk`, a missed-check count and queue-order data. Recommendation: extend `BoardRow` with these fields from `WorklistRow` instead of sorting the severity-ranked `Worklist` on the client.
2. **No missed-check count.** Rows carry only booleans. Add `missed_checkins: int`.
3. **Signed-in state.** `VisitSummary` has `signed_in_as` and `signed_in_since`, and the visit timeline includes `SessionRecord` entries for each sign-in and takeover. `BoardRow` still needs them.
4. **"Condition" is not a field.** It is derived from the last `feeling_change`, the findings and the task level. Confirm the rule.
5. **Staff identity** for acknowledge and assess is defined only as `StaffRef`. The demo role picker covers the hackathon.
6. **The FastAPI routes do not exist yet.** The frontend works against generated types (`@hey-api/openapi-ts`) and MSW mocks.
7. **Translated question text** for `pa` and `tl` must come from the question bank.

## Frontend structure (`web/`, sibling of `api/`)

Vite, React, TypeScript, Tailwind and shadcn/ui, with React Router, TanStack Query and i18n for `en`, `pa` and `tl`. The client is generated from the FastAPI OpenAPI spec. MSW handlers are seeded with the three synthetic cases: worsening chest pain, a companion reporting sudden speech change, and an unanswered head-injury check.

```
web/src/
  api/                generated client and MSW mocks
  components/ui/      shadcn
  components/         LevelChip StateChip MissedChip LinkChip CountdownChip Sparkline Timeline QrCard HelpBar AnswerButton PrivacyPanel
  features/nurse/     SignIn Enrol Triage VisitSheet Vitals Actions
  features/patient/   Exchange Home Checkin Urgent Status Leaving
  i18n/               en.json pa.json tl.json
```

## Visual references

Each link opens the exact screen on Mobbin. The screens are other companies' screenshots, so they are linked rather than copied into the repo.

**Patient and companion**

- One question per screen with big option cards and a progress bar: [Hers](https://mobbin.com/screens/996dc505-e17c-48fb-9d4d-0ed649bcdc84), [Ro](https://mobbin.com/screens/07c64cc9-88c4-4ca1-ba72-254e1603748a), [Lifesum](https://mobbin.com/screens/9e3a308a-b4fc-470b-9200-dee282e12475), [Future Pro yes/no](https://mobbin.com/screens/5b7ff37d-ad94-40c0-a389-b8a3dff5533f)
- Symptom picker with "None of these": [Flo](https://mobbin.com/screens/87d6a4de-506c-4924-8aa2-a6914d324246). Severity rows: [Visible](https://mobbin.com/screens/f3ae98a2-0de0-402b-9021-c67d4df2641d)
- Pain 0 to 10 with word labels: [Liven slider](https://mobbin.com/screens/58246da9-b4d5-428a-9f80-eab2588f135b), [Alan pain scale](https://mobbin.com/screens/8560893e-5303-4357-bf68-737d1c44c0f6), [Nike Run Club number and label](https://mobbin.com/screens/877211ae-9507-46df-9f7a-db902823ea08)
- Get help now: [inDrive SOS red full-width button](https://mobbin.com/screens/3f075a2f-0493-4d53-a905-00549b8b2fa8), [Lyft/ADT help sheet](https://mobbin.com/screens/c1757cc7-909c-4a44-a50f-43deb074d03a), [Bolt safety toolkit](https://mobbin.com/screens/b1a075e8-0e4f-4667-8deb-6d40cc331d85)
- Status timeline: [Alan](https://mobbin.com/screens/2380e885-e813-45b1-889e-c613332e8fc5), [Ro](https://mobbin.com/screens/4f1b2a26-79ae-4154-b286-741e351ff7d9), [Plum](https://mobbin.com/screens/2f132d15-b48c-442c-ad83-33e78e104a53)
- Language picker sheet: [Meta AI](https://mobbin.com/screens/e4f488dd-943c-4dd3-a6a4-fb7a65559207), [Fabric](https://mobbin.com/screens/bfd07f6d-78b7-42c2-b698-605b8fbb36c0)
- Offline and retry: [Qantas](https://mobbin.com/screens/18f77caf-19d5-4199-98b4-a36f34096d23), [GoPay](https://mobbin.com/screens/95483b32-a4d7-4025-b6e7-64220245eff5)

**Triage nurse**

- QR with print and save: [Stripe](https://mobbin.com/screens/de570acb-22de-400d-b60c-694560c7fffd), [GoFundMe print poster](https://mobbin.com/screens/7a9c2c5e-d97a-48a5-91fd-d5b0e7f02835), [Square](https://mobbin.com/screens/5bca907f-0ef0-429e-bb81-f600d508b570), [Fresha](https://mobbin.com/screens/b900ebfd-0dbf-45dd-b44a-352590243c53)
- Enrolment form: [Headspace](https://mobbin.com/screens/6b8ce8c0-2727-40aa-8751-6eae1e04d150), [Walmart Pharmacy stepper form](https://mobbin.com/screens/626c0bac-cf6a-4b31-98c9-1ee8962f0910), [Fresha consultation form](https://mobbin.com/screens/4bdb985e-94fa-40fd-80ee-bd4bc0ded7fc)
- Board with summary count cards, filters and a status table: [Deel](https://mobbin.com/screens/9f5af254-f966-4810-adbb-c428854523e3), [Heidi](https://mobbin.com/screens/97b84dad-6a86-4f60-b81b-439375d4fa16), [Fresha table with status chips](https://mobbin.com/screens/3b1a8630-7e3d-4e22-aa49-f38180943f60), [Zendesk grouped by priority](https://mobbin.com/screens/f2e7d89f-72b1-4da1-8820-fd9bd4df3350), [Wix column chooser](https://mobbin.com/screens/9fd5cdc4-12be-415f-9018-4525ca7e051a), [Supabase mini bar status](https://mobbin.com/screens/704ea722-33ea-44f5-ba70-03005b33a9f9)
- Detail sheet, acknowledge and escalate: [incident.io escalations](https://mobbin.com/screens/692c9f69-5ad5-4da3-923a-cd89d7f3fb68), [incident.io side panel](https://mobbin.com/screens/30db1df5-f778-44ad-8d87-8419e07c262d), [Better Stack acknowledge](https://mobbin.com/screens/3dab9fa9-2ff2-422d-a603-e44c3d9b8c6a), [Sentry alert detail](https://mobbin.com/screens/cd67b80a-e664-4ba6-8f38-97936d85fd40), [GitLab escalation rule](https://mobbin.com/screens/2927c5b5-6b30-4392-9ae7-57434e7c3345)
- Activity timeline: [Basecamp](https://mobbin.com/screens/3119c9f0-832e-448d-b750-03e5a806e9f6), [Bonsai](https://mobbin.com/screens/3df325e4-9bc1-433f-a4e6-eb369bb3ac29), [PandaDoc](https://mobbin.com/screens/e4c9b779-c625-4675-8005-0dca143afce8)

## Build order

Each step is its own small branch and pull request.

1. `docs/frontend-design`: this document.
2. `feat/web-scaffold`: Vite app, theme tokens, shadcn, i18n, generated types, MSW.
3. `feat/nurse-enrol-qr`: role picker, enrolment form, QR card, Show QR and staff sign-out.
4. `feat/patient-checkin`: token exchange, home, check-in, urgent, status, offline queue, privacy panel.
5. `feat/nurse-triage-board`: board, flags, detail sheet, live refetch.
6. `feat/nurse-actions`: acknowledge, assess, vitals, flag higher, visit status.

## Verification

- Run the Vite dev server with MSW and walk the loop. The nurse enrols and the QR appears; Show QR brings the same code back. The patient scans and reports "worse" with a finding. The board flag appears with the row **in the same position**. The nurse acknowledges and assesses.
- Confirm the three synthetic cases and the missed-check flag after one and two missed prompts.
- Patient checks: a companion cannot send pain, a partial check-in sends `not_reached`, "Not sure" sends `unsure`, no task level or reason reaches patient screens, and an offline submit that reconnects with the same `submission_id` shows once.
- Accessibility: keyboard only, 200% zoom, a 360px viewport, a colour-blind check (status is never colour-only), axe or Lighthouse, and all three languages.
- Component tests with Vitest and Testing Library, a Playwright run of the core loop, and clean `tsc` and lint in each PR.

## Open items

- The frontend directory name `web/` is assumed.
- Agree the `BoardRow` extension and the missed-count and signed-in fields with the backend before step 5.
- The Voltex energy-data and Solana tracks are out of scope.
