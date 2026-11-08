# Pager: server side

The hardware pager (`pager/`) is finished for the check-in. It runs against its stub (`pager/python/stub.py`), which
answers the way the API should. This plan makes the real API answer the same way, so the board only needs its config
changed (`api_base` and `pager_key` in `pager_config.json`).

Status, 2026-11-08:
- **Merged to `main`** (PR #85): `pager/`, the device, its screens and its stub.
- **On `feat/pager-api`**: the pager routes (`api/src/recheck/routes/pager.py`), `RECHECK_PAGER_KEY`, and the tests.
  Reports already go through `reports.store_report`, so the pager gets what the phone gets on the way in. That
  covers question bank checks, the scheduled check-in gate and timer, circle check scoring, rules, tasks, dashboard
  events, `patient_message` and `follow_up_items`.

## What the stub does that the API doesn't yet

| Stub behaviour | API today | Step |
|---|---|---|
| `items` in the pager state: the visit's follow-up questions | Sent (step 1) | 1 |
| `attention_prompt` in the pager state while a check-in is open | Sent, stored and scored like the phone's (step 1) | 1 |
| A `PagerState` shape the web contract knows | Model lives in `routes/pager.py` | 2 |
| One ID for each physical pager | `visit.pager_no` only | 3 |
| Everything else (errors, retries, timer, messages, follow-ups, scoring) | Same, through `store_report` | Already done |

## Steps

Each step is one branch and one pull request into `main`. Each step's checks are listed with it.

### 0. Merge the pager routes (`feat/pager-api`)
- **What's in it:** the routes, the settings, the deploy secret and the tests. The contract test is rewritten for the
  new check-in: every body the pager can send passes `PatientReport`, and the stub's answers pass `PagerState`,
  `QuestionItem`, `AttentionPrompt` and `ReportReceipt`.
- **Checks:** `uv run pytest` (offline), plus `tests/test_pager_live.py`, `tests/test_reports_live.py` and
  `tests/test_enrolment_live.py` (live, rolled back).
- **Before it's used in production:** set `RECHECK_PAGER_KEY` (16+ characters) as a GitHub secret. Without it, the
  pager routes answer 503.

### 1. Send the phone's check-in data to the pager (`feat/pager-checkin-data`)
`GET /api/pager/{n}` for a waiting visit also returns:
- **`items`:** `bank.follow_ups(group, cedis, answers_so_far(visit))`, each one built with
  `question_item(..., Reporter.PATIENT, language)`. This is what `/api/patient/home` sends a patient. The pager shows
  English only, so the pager uses `en`, whatever the visit's language. Its ASCII screen can't show other scripts.
- **`attention_prompt`:** `patient.attention_prompt(conn, bank, visit_id)` while `checkin_open`, otherwise `null`. It
  reuses a live, unanswered prompt or stores a new one, as the phone's home screen does.

The route has to change in three ways:
- **A write transaction.** Issuing a prompt inserts and audits a row, so the route moves from `pool.connection()` to
  `write_tx(pool, actor)` with actor `patient|pager:{n}`, the actor the report route already uses.
- **The state model.** `PagerState` gets `items: list[QuestionItem]` (empty unless waiting) and
  `attention_prompt: AttentionPrompt | None`.
- **Unassigned and called.** Those states send no items and no prompt.

Tests:
- **Offline:** the state model's shape, against the stub's state (`test_pager_contract.py`).
- **Live, rolled back:**
  - A waiting chest-pain visit lists `pain_moved` and `pain_sudden_worse`.
  - An open check-in has a prompt, and the same prompt comes back on the next poll.
  - A pager check-in with the right count scores correct, and the same prompt can't be answered twice.
  - A follow-up report (`purpose: followup`) is accepted before the check-in is due, and doesn't move the timer.
  - After `pain_moved = yes`, the receipt names `pain_new_location` and `change_started`, and the next state lists
    them.
- **End to end:** the board with `api_base` set to the dev API, through one full check-in.

Note: polls run every 5 seconds per pager. Issuing a prompt writes only when no live prompt exists, so most polls stay
reads. The `SELECT` that looks for a live prompt runs every 5 seconds. That's fine at demo scale, and it's indexed by
`attention_prompt_visit_idx`.

### 2. Put `PagerState` in the contract (`feat/pager-contract`)
- **Move the model.** `PagerState` moves to `api/src/recheck/contract/pager.py`, so the web contract
  (`npm run gen:contract`) knows it, and the staff screens can later show a pager's state.
- **Checks:** `npm run check:contract` and `npm run typecheck` in `web/`, plus the API tests.

### 3. One ID for each pager (`feat/pager-registry`)
This is the database plan from earlier:
- **Schema:** a `pager` table (`id`, `site_id`, `pager_no`, `label`, `registered_at`, `retired_at`), and
  `visit.pager_id`, checked by a foreign key on `(pager_id, site_id, pager_no)`. `pager_id` and `pager_no` are set
  together, a visit's pager can't change, and a retired pager can't be given out.
- **Database files:** the migration with its backfill, the seed for the demo pager, and the schema checks.
- **API:** enrolment refuses an unregistered pager (422). The pager routes look the pager up first, and the
  synthetic loader registers its pagers.
- **Order:** the migration runs on Tiger Cloud just before the deploy.

### 4. Later, if wanted
These also change the board:
- **Pairing:** the idle screen shows the pager's number, and the patient presses CONFIRM at hand-over.
- **Keys per pager:** each pager gets its own key, stored as a hash, in place of the shared `RECHECK_PAGER_KEY`.
- **Offline pagers:** a pager that stops polling becomes a delivery failure on its visit's task.

## Not changing

- **The pager's report bodies, its screens and the stub's behaviour.** The stub is the reference. If the API
  disagrees with it, fix the API, or change both, together with `pager/tests/test_stub.py`.
- **The phone's flow.**
