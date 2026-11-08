# Polish (pl) – points for medical translator review

- Register: body text uses impersonal constructions and "proszę + bezokolicznik" (e.g. "Proszę spróbować ponownie"). Button labels use the standard short imperative ("Wyślij", "Dokończ później"), which is the usual Polish UI convention. "Pan/Pani" is never used. Questions to the patient are impersonal (e.g. "Jakie jest teraz samopoczucie?", "Ile razy od przyjazdu wystąpiły wymioty?"). Check that they still clearly address the reader.
- First-person patient phrases avoid gendered past tense ("Potrzebuję pomocy teraz", "Wychodzę", "Nie mogę tego zrobić"). Options are noun phrases ("Omdlenie lub prawie omdlenie") rather than "zemdlałem/am".
- Companion wording uses "ta osoba" (with grammatically feminine agreement) as the gender-neutral reference. "Pacjent" (generic masculine) appears only in `signedInAs.patient` and `sent.stillChecking`; "Jestem pacjentem / pacjentką" appears in role selection.
- "I'm not sure" is rendered "Nie wiem" ("I don't know"), because "Nie jestem pewien/pewna" is gendered. It cannot be read as "no".
- "Clinician" is rendered "Lekarz" (doctor), which leaves out NPs. Confirm, or use "personel medyczny".
- Symptom wording to check: confusion = "zagubienie, dezorientacja" (plain, not "splątanie"); drowsiness = "Trudno nie zasnąć"; seizure = "napad drgawek"; arm = "Ręka (ramię)", since "ręka" alone can mean hand; triage = "punkt triażu" / "pielęgniarka triażowa".
- "Check-in" questionnaire = "ankieta"; `patient.title` "Rejestracja potwierdzona" and `titleCompanion` "Tryb osoby towarzyszącej" are adapted rather than literal.
- `symptoms_change` and `headache_change` use the adverb options "Lepiej / Bez zmian / Gorzej" with the question reworded to fit. `takeover.who` is written as "{{who}}: zalogowano…" to avoid gender agreement. Placeholders sit after a colon or in parentheses, so numerals never need plural inflection.
