# Question bank

The fixed, versioned questions that Recheck asks patients and companions, as FHIR R4 resources. This is demo content. It does not have clinical approval.

| File | Contents |
| --- | --- |
| `questionnaire.json` | FHIR `Questionnaire`: all questions, their wording and their branching |
| `cedis-groups.json` | FHIR `ConceptMap`: CEDIS complaint code to complaint group, and the complaints where the app is not offered |
| `SOURCES.md` | The evidence and the reuse status of each item |
| `translations/` | Patient wording in 14 languages, with reviewer notes in `translations/notes/` |

`api/src/recheck/question_bank.py` loads both JSON files, checks them against the API contract, and selects the follow-up questions. The tests in `api/tests/question_bank/` run the checks. The web app uses a copy that `npm run gen:contract` makes.

## Parts of a check-in

1. **Buttons that are always visible:** "I need help now", "I'm worried", "Question about my wait or care" and "I'm leaving". Each button sends its own report. "Question about my wait or care" goes only to the triage nurse.
2. **Base check-in for all visits:**
   - two wellness questions, adapted from Martha's Rule
   - pain 0–10 (patient only)
   - new warning signs
   - the circle-counting check (patient only)
3. **Follow-ups.** `enableWhen` selects them from the complaint group of the visit, its CEDIS code and the earlier answers. The app shows items marked `ask-after-routing` only after it routes any urgent finding.

| Group | CEDIS codes | Follow-ups |
| --- | --- | --- |
| `chest_back_pain` | 003, 004, 551, 301 | `pain_moved`, `pain_new_location`, `pain_sudden_worse`, `change_started` |
| `neuro_change` | 409, 410, 403, 406, 504, 508, 404 | `symptoms_change`, `headache_sudden_worse` (404 only) |
| `head_injury` | 407, 102, 105 | `harder_to_wake`, `vomit_count`, `headache_change`, `seizure`, `more_confused` |
| `confused_drowsy` | 401, 402, 405, 751, 854 | `more_confused`, `harder_to_wake`, `seizure` |
| `general` | all other codes | none |

In all groups, `last_known_well` comes after a reported speech change, facial droop or one-sided weakness.

## Enrolment and exclusions

The triage nurse selects the group and any exclusion. `check_enrolment()` rejects a selection that the CEDIS map contradicts:

- a group that is not the mapped group
- the app offered for an excluded complaint

For codes that are not in the map, the nurse selects the group. The nurse can exclude any visit, for example because of age.

The app is not offered for:

- children
- pregnancy over 20 weeks (458)
- self-harm or violence (351, 355)
- major trauma (801, 802)

These visits stay on the staff list, and the staff timer continues. They get no QR.

Staff can also exclude a visit after enrolment. Patient prompts stop. The devices of the visit are signed out. The token history stays. Staff cannot remove an exclusion.

## Patient or companion

The person chooses patient or companion when they scan the QR. Thus the check-in does not ask. The hidden `session_role` item holds the choice. Pain and the circle check show only for a patient sign-in (`enableWhen session_role = patient`). A companion can send a check-in alone.

## Conventions

- **Keys.** Each `linkId` is the item key in `CheckinReport.items`, or it names a base field through `urn:recheck:fhir:contract-field`. The option codes agree with the code lists of the contract.
- **Companion wording.** It is in `urn:recheck:fhir:companion-text`.
- **"Not sure".** The app shows it when `allow-unsure` is true. It sends `missing: unsure`, never "no".
- **Rules are separate.** Branching only decides what to ask. The rules decide which answers make a staff task. Two rules depend on this bank:
  - In the neuro, head-injury and confused groups, a "same" or "better" answer from the patient never cancels a staff check.
  - A wrong count, or a prompt that the patient saw but did not answer, makes a non-urgent in-person staff check. A check-in without a prompt, for example from a companion, is not a missed check.
- **Changes.** A change to wording or branching needs a new `version` in both files.

## Translations

The contract has the 15 most common mother tongues in Alberta (2021 Census). The bank itself is the English version. Each other language has `translations/<code>.json`.

- **Contents.** The patient wording in the structure of `english_wording()`: question text, companion wording, option labels and the "none of these" label. The keys are `linkId` and option code. Staff screens stay in English.
- **Status.** `draft` means that no certified medical translator checked the file. Patients then see a notice. Set `reviewed` only after a professional translation review and a back-translation check. Claude wrote the current files, and they are all drafts. `translations/notes/<code>.md` tells a reviewer what to check first.
- **Versions.** Each file names the `bankVersion` that it translates. When a wording change increases the version, older translations stop loading. Patients then see English until each language is updated. The tests fail until then.
