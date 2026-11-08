# German (de) – points for medical translator review

- Register: "Sie" throughout. Companion wording uses "die Person" (pronoun "sie/ihr") as the gender-neutral reference to the patient; "Die Patientin / der Patient" is used only in `exchange.signedInAs.patient`.
- "Check-in" (the recurring questionnaire) is rendered "Abfrage"; the visit sign-in is "Anmeldung". Confirm both read naturally to lay users.
- "Clinician" (physician or nurse practitioner) is rendered "medizinische Fachkraft". "Arzt/Ärztin" would leave out NPs. Confirm.
- "Triage" is kept, glossed once as "Ersteinschätzung (Triage)"; the desk is "Triage-Schalter", and the nurse is "Triage-Pflegekraft".
- Symptoms: "Krampfanfall" for seizure (fit); "Gesicht hängt auf einer Seite herab" for facial droop; "Atmen fällt schwerer" for trouble breathing; "Schwer, wach zu bleiben" for drowsiness. Check that these are clear and urgent enough.
- `worst_headache` keeps the source's first person ("meines Lebens"), even in companion mode, to match the English.
- "Health number" (Alberta PHN) is rendered "Krankenversicherungsnummer". This is the closest everyday equivalent, not a literal translation.
- `{{estimate}}` and `{{waited}}` sit after a colon so the sentence works whatever unit format the app inserts.
