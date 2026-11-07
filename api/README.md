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

Conventions:

- Request bodies reject unknown fields, and numbers aren't coerced from strings.
- Timestamps must include a timezone.
- Every write carries a client-generated `submission_id`, resent unchanged on retry.
- A report records who answered (`reporter`) separately from the device (`channel`).
- The visit and the acting staff member come from the session, never the body.
- Question bank item keys are data, checked against the bank version the report names.

## Develop

```sh
uv sync
uv run pytest
```
