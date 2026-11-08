# Recheck API

Python back end: API contract, rules, scheduled checks and simulator (see `AGENTS.md`).

## API contract

`src/recheck/contract/` holds a Pydantic model for every request and response body. FastAPI turns them into the OpenAPI spec, and the React app generates its TypeScript types from that spec with `@hey-api/openapi-ts`.

| Module | Contents |
| --- | --- |
| `codes.py` | Fixed code lists (complaint groups, findings, task levels, dispositions) |
| `answers.py` | Answer values: a value or an explicit missing reason |
| `reports.py` | Patient and companion reports from phone, pager or simulator |
| `visits.py` | Enrolment, QR token exchange, visit state |
| `staff.py` | Vitals, "flag higher", acknowledge, assess |
| `tasks.py` | Review tasks the rules produce |
| `patient.py` | What patient and companion screens load |
| `views.py` | Physician worklist, triage board, charge nurse view, handover, quality page |
| `events.py` | Live dashboard notifications |

## Question bank

`src/recheck/question_bank.py` loads the FHIR question bank in `../question-bank/`, checks it against the contract code lists and picks follow-up questions from the complaint group and earlier answers. `src/recheck/attention.py` generates and scores the circle-counting check. See `../question-bank/README.md`.

Conventions:

- Request bodies reject unknown fields, and numbers aren't coerced from strings.
- Timestamps must include a timezone.
- Every write carries a client-generated `submission_id`, resent unchanged on retry.
- A report records who answered (`reporter`) separately from the device (`channel`).
- The visit and the acting staff member come from the session, never the body.
- Question bank item keys are data, checked against the bank version the report names.

## Synthetic cohort

`src/recheck/synthetic/` builds a synthetic Calgary waiting room of 40 visits and loads it into the database. Every visit has check-ins, attention prompts, vitals, tasks and outcomes. It holds no names, health numbers or real data.

```sh
uv run python -m recheck.synthetic.load --dry-run --json cohort.json   # build only
uv run python -m recheck.synthetic.load --tokens-out ../.seed-tokens.json   # load into RECHECK_DATABASE_URL
```

- **Live times.** Times are set relative to the load time, so the board looks live. The same `--seed`, `--batch` and `--anchor` always give the same cohort.
- **One load per batch.** Rows can't be deleted, so each batch name loads once. Use `--batch demo-2` to refresh the demo.
- **Database role.** The loader runs in one transaction as `recheck_app`, with `app.actor = 'seed|synthetic-cohort'`. It needs the current `db/schema.sql`.
- **QR tokens.** Each load generates random QR tokens. `--tokens-out` writes the patient links to a git-ignored file. Until the API encrypts tokens, the desk can't re-show seeded QRs.
- **Demo cases** (`scenario` in the JSON):
  - `chest-worsening`: red task, not yet acknowledged
  - `companion-speech-live`: a companion signed in for the live speech-change report
  - `head-injury-unanswered`: missed check-in, with the staff reassessment also overdue
  - `companion-speech-done`: full loop to rooming
  - `leave-intent`
  - `pager-silent`
  - `confused-takeover`: a second device takes over
  - `desk-question`
  - three visits where the app isn't offered
- **Generated visits.** The other 29 are generated. About 7% leave without being seen. That target comes from Alberta's 4.1–4.8% and Ottawa's 9.1%. Relative effects of triage level, age, arrival hour and ambulance come from NHAMCS 2019–2022, and the crowding effect from Ottawa.
- **Sources.** `calibration.py` lists every number with its source. Values marked "demo assumption" are for the site to replace. This is not a validated risk model.
- **Tests.** `tests/synthetic` checks schema-level invariants across many seeds. Set `RECHECK_TEST_DATABASE_URL` to a scratch database to also run the load test.

## Develop

```sh
uv sync
uv run pytest
```
