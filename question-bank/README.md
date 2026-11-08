# Question bank

The fixed, versioned questions Recheck asks patients and companions, as FHIR R4 resources. Demo content, not clinically approved.

| File | Contents |
| --- | --- |
| `questionnaire.json` | FHIR `Questionnaire`: every question, its wording and its branching |
| `cedis-groups.json` | FHIR `ConceptMap`: CEDIS complaint code to complaint group, and complaints where the app is not offered |
| `SOURCES.md` | Evidence and reuse status for each item |

`api/src/recheck/question_bank.py` loads both files, checks them against the API contract and picks follow-up questions. The tests in `api/tests/question_bank/` run the checks.

## How a check-in is built

1. **Always-visible buttons:** "I need help now", "I'm worried", "Question about my wait or care" and "I'm leaving". Each sends its own report; "Question about my wait or care" goes to the triage nurse only.
2. **Base check-in (everyone):**
   - two wellness questions adapted from Martha's Rule
   - pain 0–10 (patient only)
   - new warning signs
   - the circle-counting check (patient only)
3. **Follow-ups:** chosen by `enableWhen` from the visit's complaint group, its CEDIS code and earlier answers. Items marked `ask-after-routing` are offered only after any urgent finding has been routed.

| Group | CEDIS codes | Follow-ups |
| --- | --- | --- |
| `chest_back_pain` | 003, 004, 551, 301 | `pain_moved`, `pain_new_location`, `pain_sudden_worse`, `change_started` |
| `neuro_change` | 409, 410, 403, 406, 504, 508, 404 | `symptoms_change`, `headache_sudden_worse` (404 only) |
| `head_injury` | 407, 102, 105 | `harder_to_wake`, `vomit_count`, `headache_change`, `seizure`, `more_confused` |
| `confused_drowsy` | 401, 402, 405, 751, 854 | `more_confused`, `harder_to_wake`, `seizure` |
| `general` | everything else | none |

`last_known_well` follows any reported speech change, facial droop or one-sided weakness, whatever the group.

**Enrolment:** the triage nurse picks the group and any exclusion. `check_enrolment()` rejects a choice the CEDIS map contradicts: a group other than the mapped one, or the app offered for an excluded complaint. For unlisted codes the nurse chooses the group, and any visit can be excluded, for example by age.

**App not offered:**
- children
- pregnancy over 20 weeks (458)
- self-harm or violence (351, 355)
- major trauma (801, 802)

These visits stay on the staff list with the staff timer running. No QR is issued.

Staff can also exclude a visit after enrolment. Patient prompts stop, the visit's devices are signed out and the token history is kept. An exclusion can't be removed.

**Patient or companion:** chosen when the person scans the visit's QR, so the check-in doesn't ask. The hidden `session_role` item carries it, and pain and the circle check appear only when the patient signed in (`enableWhen session_role = patient`). A companion can submit a check-in on their own.

## Conventions

- **Keys:** each `linkId` is the item key in `CheckinReport.items`, or names a base field through `urn:recheck:fhir:contract-field`. Option codes match the contract's code lists.
- **Companion wording:** in `urn:recheck:fhir:companion-text`.
- **"Not sure":** shown when `allow-unsure` is true, and sent as `missing: unsure`, never as "no".
- **Languages:** English only for now. The other 14 contract languages (French and the most common other mother tongues in Canada, from the 2021 Census) are marked `translation-pending` and need professional translation.
- **Rules live elsewhere:** branching only decides what to ask. Which answers create a staff task belongs in the rules, including two that rely on this bank:
  - In the neuro, head-injury and confused groups, a patient's "same" or "better" never cancels a staff check.
  - A wrong count, or a prompt shown but not answered, creates a non-urgent in-person staff check. A check-in with no prompt shown, such as from a companion, is not a missed check.
- **Changes:** any wording or branching change needs a new `version` in both files.
