# UK precedents for patient- and family-initiated escalation and patient-facing deterioration questions (adult A&E waiting room)

Retrieved 2026-11-07. Evidence labels used throughout:

- **[fetched]**: Quoted text came from a direct fetch of the page. The fetch tool returns extracts through a summariser, so recheck exact punctuation before you reproduce it in product copy.
- **[snippet]**: Paraphrase or quote from a web-search summary. The page itself was not opened. Treat it as unverified wording.
- **[not retrieved]**: The page blocked automated access. england.nhs.uk returned HTTP 202 with an empty body. pslhub.org, nice.org.uk and royalmarsden.nhs.uk returned 403. elht.nhs.uk and bradfordhospitals.nhs.uk returned empty pages.

Recheck is in Calgary, so every UK "call 999" instruction maps to 911 locally. Local copy must not say 999.

---

## 1. Martha's Rule core standards: wellness question, frequency, who escalates, response, second review

### Takeaway
Martha's Rule has three components. The first is a structured wellness question asked at least daily. The second is 24/7 access for staff, patients, families, carers and advocates to a rapid review. The third is a review done by a team outside the treating team, usually critical care outreach. NHS England added six core standards on 2 March 2026. The canonical core standards page could not be retrieved, so the standard text below comes from secondary snippets.

### Cited Findings
- **Wellness question.** Patients are asked "at least daily, about how they are feeling and if they are getting better or worse." [snippet] — [NHS England, Martha's Rule Programme October 2025 statistics](https://www.england.nhs.uk/statistics/statistical-work-areas/marthas-rule/marthas-rule-2025-26/marthas-rule-programme-october-2025/)
- **Escalation route.** The route is "Review by a critical or paediatric care outreach team or alternative, as defined by the hospital's Standard Operating Procedures." [snippet] — [same NHS England statistics page](https://www.england.nhs.uk/statistics/statistical-work-areas/marthas-rule/marthas-rule-2025-26/marthas-rule-programme-october-2025/)
- **Who can escalate (staff).** "All staff in NHS trusts must have 24/7 access to a rapid review from a critical care outreach team." [snippet]
- **Who can escalate (patients and families).** "All patients, their families, carers, and advocates must also have access to the same 24/7 rapid review from a critical care outreach team." The route is advertised around the hospital. [snippet] — [Patient Safety Commissioner / NHS England via search](https://www.patientsafetycommissioner.org.uk/our-work/marthas-rule/)
- **Core standards.** There are six, published 2 March 2026 [snippet] — [PSL hub listing "Martha's Rule: core standards (NHSE, 2 March 2026)"](https://www.pslhub.org/learn/professionalising-patient-safety/patient-safety-standards/martha%E2%80%99s-rule-core-standards-nhse-2-march-2026-r14143/) [not retrieved: 403]. Standard 1 covers reliable implementation and equitable access across all three components. Standard 2 covers rapid reviews by independent, appropriately skilled clinicians. One reflection question asks whether patients, families, carers and staff "would report that their perspectives are actively sought, captured and used in both the patient wellness question and rapid review." [snippet] One outlet reports a 2027 implementation deadline. [snippet] — [Healthcare Conferences UK, 25 Mar 2026](https://www.healthcareconferencesuk.co.uk/news/2026-3-25/nhs-introduces-core-standards-for-martha-s-rule-with-2027-deadline)
- **Example trust implementation (Leeds Call 4 Concern, inpatients only):**
  - Wellness question: "we ask at least daily if patients are feeling better or worse."
  - Order of escalation: "If, after speaking to the care team, you remain worried and feel your concerns are not being addressed, call for a rapid review."
  - Line: 0113 206 6677, 24/7.
  - Reviewer: calls go to "a different team in our hospital, who specialise in the care of critically ill patients" (Critical Care Outreach).
  - Example triggers for families: "You are worried about their condition", "The patient seems different to usual (not themselves)", "Breathing differently", "Hands feel cold or very hot".
  - Scope: the line is "exclusively for raising concerns about inpatients." [fetched] — [Leeds Teaching Hospitals, Call 4 Concern – Martha's Rule](https://www.leedsth.nhs.uk/patients/call-4-concern-marthas-rule/)
- **Example trust implementation (Barnsley pilot).** The page asks "Are you worried you or your loved one is getting more unwell?" Scope is ward areas, not A&E. [snippet] — [Barnsley Hospital, Martha's Rule pilot](https://barnsleyhospital.nhs.uk/patients/marthas-rule)
- **Trust PWQ phrasing (Bradford).** Reported wording is "How are you feeling today?" and "How are you feeling compared to the last time we asked you (or compared to yesterday)?" [snippet; page fetch returned empty] — [Bradford Teaching Hospitals](https://www.bradfordhospitals.nhs.uk/?p=42436)
- **Response times.** No numeric response-time standard (for example, "within X minutes") was found in any retrieved source. See Gaps.

### Inferences
- In Martha's Rule the patient or family speaks to the care team first. The helpline is a second step for concerns that are not addressed, and a different team answers it. Recheck's "I'm worried" button routes straight to the triage liaison physician, which fits a waiting room where there is no treating team yet. A Martha's-Rule-faithful design would also offer a second-step "still worried" route to someone other than the first responder (for example the charge nurse or backup physician) when the first report has been acknowledged but the person is still worried.
- The "at least daily" frequency is set for inpatients. Recheck's CTAS-based intervals are much shorter. The UK frequency gives no upper bound and does not transfer directly.

### Gaps
- The full text of the core standards page (england.nhs.uk long-read) could not be retrieved, so standard titles 3–6 and any response-time wording are unconfirmed. The repo's `SOURCES.md` already flags this. That flag still stands.
- No public numeric target for how fast the rapid review must happen was found.

---

## 2. Martha's Rule extension to A&E and waiting rooms (2026); checking repo brief §3a

### Takeaway
NHS England announced the A&E extension on 22 September 2026. It covers every A&E department, including waiting rooms, with phased completion by March 2028. The basis was a seven-trust pilot from September 2025 to March 2026 that logged 69 calls and needed no extra clinical staff. The pilot trusts are not named publicly. No retrieved source describes an ED-specific wellness question. The family route is still "speak to the care team, then call a dedicated number."

The call statistics in §3a of the repo brief cite the wrong source and contain one figure ("222") that could not be found.

### Cited Findings
- **Nursing Times, 22 Sep 2026 [fetched]:**
  - The pilot ran "in seven trusts" "between September 2025 and March 2026" and logged 69 calls. Some calls concerned acute deterioration, and a few led to urgent surgery or ICU transfer.
  - It ran "without requiring additional clinical staff."
  - Patients, relatives and staff can "call a dedicated phone number to trigger an urgent review." The programme "encourages patients, families and carers to speak to the care team if they notice changes in someone's condition."
  - The rollout completes "by March 2028." No trusts are named.
  - Source: [Nursing Times](https://www.nursingtimes.net/emergency-and-critical-care/marthas-rule-set-to-be-expanded-to-all-ae-departments-22-09-2026/)
- **EMJ, 22 Sep 2026 [fetched]:**
  - The expansion includes A&E waiting rooms. Escalation is a dedicated hospital helpline used when concerns "haven't been adequately addressed." A separate clinical team does the review.
  - July 2026 was a record month at 1,678 calls.
  - The rule was extended to every maternity and neonatal unit in June 2026.
  - Quote from Dr Aidan Fowler: "Martha's Rule is already helping to save lives."
  - Source: [EMJ](https://www.emjreviews.com/general-healthcare/news/marthas-rule-to-expand-across-englands-aes/)
- **Scope from secondary coverage [snippet]:** adult and paediatric emergency care, major treatment areas, resus, "reception and waiting rooms", and temporary escalation spaces such as corridors. The pilot was one trust per NHS region. Families are told to check the trust website or ask staff. — [search summary of ITV / Healthcare Conferences UK / South London News coverage](https://www.itv.com/news/2026-09-22/marthas-rule-extended-to-all-hospital-a-and-es-in-england) (ITV page timed out on fetch)
- **Hill Dickinson, 29 Sep 2026 [fetched]:** the rule will cover "all hospital A+E departments and waiting areas in England", with "full implementation by March 2028." Context: A&E saw up to 240,000 more attendances than the same period in 2025. No adapted ED wellness question is described. — [Hill Dickinson](https://www.hilldickinson.com/our-view/articles/marthas-rule-expanded-across-nhs-ae-departments/)
- **March 2026 NHS England release, via the Clinical Services Journal mirror [fetched]** (published 12 Mar 2026; the NHS England original [not retrieved]):
  - "10,119 escalation calls" were made from "September 2024 and December 2025."
  - "3,457 of these calls helped identify acute deterioration." That is 34%.
  - "1,885 patients receiving changes in treatment."
  - "446 potentially life-saving interventions to transfer them to enhanced levels of care."
  - **No breakdown by caller type and no early-warning-score comparison.**
  - Sources: [CSJ](https://www.clinicalservicesjournal.com/story/50907/over-10-000-calls-to-marthas-rule-in-first-16-months-to-trigger-urgent-review-of) · [NHS England original](https://www.england.nhs.uk/2026/03/over-10000-calls-to-marthas-rule-in-first-16-months-to-trigger-urgent-review-of-care/)
- **NHS England statistics and programme pages [snippet]:**
  - From September 2024 to June 2026 there were 17,490 calls. "The highest proportion of calls (72%) made via the family/carer escalation process." 5,299 calls (30%) related to acute deterioration.
  - From June 2025 to June 2026, an EWS was recorded before 3,144 of 3,349 acute-deterioration calls (94%). For 82% of these, the EWS "would not otherwise have triggered escalation." Of those, 13% led to transfer of care and 56% to another change in treatment.
  - The NHS England Martha's Rule landing page gives June 2025–May 2026 with 82%, 14% transfer and 55% other change.
  - The January and February 2026 monthly pages show the same 72% family/carer share.
  - Sources: [NHS England Martha's Rule](https://www.england.nhs.uk/patient-safety/marthas-rule/) · [Jan 2026 statistics](https://www.england.nhs.uk/statistics/statistical-work-areas/marthas-rule/marthas-rule-2025-26/marthas-rule-programme-january2026-2/) · [Feb 2026 statistics](https://www.england.nhs.uk/statistics/statistical-work-areas/marthas-rule/marthas-rule-2025-26/marthas-rule-programme-february2026-2/)
- **Staff calls.** A separate May 2026 release reports that more than 1,000 staff called Martha's Rule helplines in the first 18 months, with 12,301 total calls. [snippet] — [NHS England, May 2026](https://www.england.nhs.uk/2026/05/1000-nhs-staff-call-marthas-rule-helplines-in-first-18-months/)
- **Evaluation.** A national NIHR-funded evaluation, led from Leicester, was launched in 2026. One secondary source says it was announced 17 June 2026 as a three-year study including mortality, and that it has not yet reported. [snippet] — [University of Leicester news, Aug 2026](https://le.ac.uk/news/2026/august/martha-rule-evaluation-leicester-nihr) · [Drawpie explainer](https://drawpie.com/blog/marthas-rule-explained-us-equivalent/)

### Checking brief §3a claim by claim

| Brief claim | Verdict | Correction |
|---|---|---|
| 72% of calls via family/carers (Sep 2024–May 2026) | Substantively right, wrong source | The figure is in NHS England statistics pages, not the March 2026 press release. Cite the statistics page with its period, for example Sep 2024–Jun 2026, 17,490 calls. |
| About 31% concerned acute deterioration | Approximately right | Statistics give 30% (Sep 2024–Jun 2026). The March release gives 34% (Sep 2024–Dec 2025). State which period you use. |
| "For 222 calls that led to a transfer of care, the EWS would not have triggered" | **Not found** in any source | Replace it with: "Of acute-deterioration calls (June 2025–May/June 2026), 82% came when the early-warning score would not have triggered escalation; 13–14% of those led to transfer of care and 55–56% to another change in treatment" (NHS England). |
| Nursing Times 22 Sep 2026: seven-trust pilot, Sep 2025–Mar 2026, 69 calls, no extra clinical staff, all A&Es incl. waiting rooms by March 2028 | **Confirmed** | Add that the trusts are not named and that the escalation is a phone line after first speaking to staff. |
| "NHS England's phase 3 began extending the programme into ED, maternity and neonatal settings in 2026" (§3) | Broadly consistent | Maternity and neonatal began June 2026 (EMJ). The ED extension was announced 22 Sep 2026. |

### Inferences
- Pilot call volume was very low: 69 calls across 7 trusts in about 8 months, roughly 1–1.5 calls per trust per month. The UK ED model is a phone line used after first speaking to staff, so it has high friction. An always-visible in-app button carries much lower friction and should be expected to produce far more reports. UK pilot volumes therefore cannot be used to predict Recheck alert load.
- The 82% "EWS would not have triggered" figure is the strongest UK evidence that a patient's or family's worry adds signal beyond physiology. It comes from operational programme data with no comparator, not from an outcome study.

### Gaps
- Names of the seven ED pilot trusts, and any ED-specific wellness question, poster or leaflet wording. No trust A&E waiting-room Martha's Rule page was found.
- The NHS England 22 Sep 2026 press release itself was not retrieved. Details come from Nursing Times, EMJ, Hill Dickinson and search summaries.

---

## 3. Trust implementations: Call 4 Concern and Patient Wellness Questionnaire wording and scales

### Takeaway
The published Patient Wellness Questionnaire (PWQ) has two 5-point items. Item 1 runs very good / good / fair / poor / very poor. Item 2 runs much better / better / no change / worse / much worse, compared with "the last time you were asked." Trusts paraphrase it ("today", "compared to yesterday"). Call 4 Concern pages present escalation as a second step after speaking to the ward team.

### Cited Findings
- **Albutt et al., J Patient Saf 2021 [fetched]:**
  - Q1: "How are you feeling?" Options "Very poor (5), poor (4), fair (3), good (2), very good (1)".
  - Q2: "How are you feeling compared with the last time you were asked?" Options "Much worse (5), worse (4), no change (3), better (2), and much better (1)".
  - Administration: nurses and HCAs at routine observations over 4 weeks.
  - Setting and sample: four oncology wards in a community hospital in Northern England, September 2017. Ratings were recorded for 103 of 125 patients, at 14% of observations (range 3–55%).
  - Results: Q1 predicted the next NEWS (β = 0.180, P = 0.033). The combined rating predicted NEWS about 24 h later (β = 0.229, P = 0.005). The authors call the findings preliminary.
  - The study collected patient self-ratings only and makes no family/carer recommendation.
  - Source: [PMC8612917](https://pmc.ncbi.nlm.nih.gov/articles/PMC8612917/)
- **Trust paraphrases.** Bradford: "How are you feeling today?" / "compared to the last time we asked you (or compared to yesterday)". WWL: "today" / "compared to yesterday". [snippet] — [Bradford](https://www.bradfordhospitals.nhs.uk/?p=42436) · [WWL](https://www.wwl.nhs.uk/marthas-rule)
- **East Lancashire.** The Call 4 Concern PWQ page exists but returned an empty body. [not retrieved] — [ELHT](https://elht.nhs.uk/services/call-concern/call-concern-patient-wellness-questionnaire). A related blog by Megan Dowson (28 Feb 2025) was listed in search but not opened. — [ELHT blog](https://elht.nhs.uk/news-and-media/ceo-blog/guest-blog-megan-dowson-patient-wellness-questionnaire)
- **Royal Marsden.** The page returned 403. [not retrieved] — [Royal Marsden](https://www.royalmarsden.nhs.uk/your-care/inpatient-care/marthas-rule)
- **Leeds Call 4 Concern** (see §1): family triggers are worry, "seems different to usual (not themselves)", "breathing differently", and "hands feel cold or very hot". [fetched] — [Leeds](https://www.leedsth.nhs.uk/patients/call-4-concern-marthas-rule/)
- **No trust A&E waiting-room leaflet or poster** with "tell us if you feel worse" wording was found in this session. See RCEM (§4) for the national expectation.

### Inferences
- Recheck's middle option "OK" replaces PWQ's "fair", and "About the same" replaces "no change". Both are reasonable plain-language adaptations but should be logged as deviations from the published instrument.
- PWQ item 2 is anchored to "the last time you were asked." Recheck anchors it to "when staff last checked on you," and a waiting patient may not know when that was. The trust versions show anchors are adapted locally ("yesterday"), so a change of anchor has precedent.
- Leeds's "seems different to usual (not themselves)" is a companion-oriented cue that Recheck's companion copy does not currently use.

### Gaps
- PWQ wording as used verbatim by ELHT and Royal Marsden (pages blocked).
- Whether any UK trust adds a "not sure" option to the PWQ. None found.

---

## 4. RCEM guidance on waiting-room safety, reassessment, signage and patient information

### Takeaway
RCEM's May 2025 patient-information guideline says three things about waiting patients. They should get automated, up-to-date wait estimates. They should know why they are waiting. They should be "clear who they need to approach" if they feel worse. The January 2024 crowding guidance recommends extra waiting-area oversight and reassessment after a set wait. Its text could not be fully extracted.

### Cited Findings
- **RCEM, Providing Patient Information in the ED, May 2025 [fetched; text extracted from the PDF]:**
  - Recommendation 2: "Patients who are waiting in a waiting room to be seen, should be able to access automated up to date information regarding estimated waiting time which is relevant to them."
  - Body text: "Patients who are waiting in the ED should be clear why they are waiting and kept informed and up to date with regards the progress of their care. Patients should be clear who they need to approach if they have questions regarding why they are waiting or if they feel their condition is getting worse."
  - Also: "For patients on trolleys or unable to mobilise from chairs they should be provided with call bells." "Patients should be given regular updates and forecasts." The Design Council has standardised ED signage, and waiting-room display screens are "an option."
  - Recommendation 4: information "in a format that is appropriate for the patient."
  - Recommendation 5: "Departments should not assume all patients are able to access online material."
  - Discharge advice should include what to do if an emergency complication develops, "e.g. contact 999 or go to the ED."
  - Source: [RCEM PDF](https://rcem.ac.uk/wp-content/uploads/2025/05/Providing-Patient-Information-in-the-Emergency-Department-RCEM-Best-Practice-Guideline-May-2025.pdf)
- **RCEM, Management of ED Crowding, Jan 2024.** The text includes "Additional oversight of the ED waiting area" and "consider whether those patients waiting beyond a set period of time…" (the snippet was cut off). [snippet; full-text extraction failed because of the PDF font encoding] — [RCEM PDF](https://rcem.ac.uk/wp-content/uploads/2024/01/RCEM_Crowding_Guidance_Jan_2024_final.pdf). The repo brief's paraphrase ("assigning staff to check waiting areas and considering repeat initial assessment, including vitals, after prolonged waits") is consistent with the snippet but was not verified word for word.
- **RCEM, Initial Assessment (Apr 2025):** registration within 5 minutes of arrival and initial assessment started within 15 minutes. EDs must use early warning scores for adults, pregnant adults and children. [snippet] — [RCEM PDF](https://rcem.ac.uk/wp-content/uploads/2025/04/Initial-Assessment.pdf)
- **Other RCEM documents listed but not opened:**
  - Delayed handovers (Jun 2025): regular reassessment for deterioration of patients held in ambulances. [snippet] — [PDF](https://rcem.ac.uk/wp-content/uploads/2025/06/Delayed-Hospital-Handovers-and-Clinical-Assessment-of-Patients-Waiting-in-Ambulances-Outside-Emergency-Departments-1.pdf)
  - Care in Temporary Escalation Spaces position statement (Dec 2024). [not opened] — [PDF](https://rcem.ac.uk/wp-content/uploads/2024/12/Care-in-Temporary-Escalation-Spaces-RCEM-Position-Statement-1.pdf)

### Inferences
- RCEM's two core expectations, "clear who to approach" and up-to-date wait information, map directly onto Recheck's urgent screen ("Tell a staff member now") and the wait estimate. Both are supported.
- "Departments should not assume all patients are able to access online material" supports keeping non-app patients on the staff list and keeping printed or verbal safety-netting alongside the QR code.
- RCEM's call-bell recommendation for patients who cannot mobilise supports the brief's requirement to design for people who cannot walk to the desk. On the urgent screen, "call out for help" is the no-device equivalent.

### Gaps
- Exact RCEM crowding text and any numeric reassessment interval for waiting patients (PDF text not extractable).
- No RCEM statement specifically on patient-initiated digital escalation or Martha's Rule in EDs was found.

---

## 5. NHS public safety-netting language: red-flag lists to check Recheck's "new warning signs" against

### Takeaway
NHS.uk uses short, observable, mostly second-person bullets under a single action heading ("Call 999 if:" or "Call 999 or go to A&E if:"). Several lists end with a catch-all for worry. Recheck's warning-sign list covers most stroke, head-injury and breathing red flags. It omits skin colour change (sepsis and breathing) and seizure as a universal sign. One option uses clinical jargon ("worst headache of my life").

### Cited Findings
- **Chest pain, NHS.uk [fetched].** "Call 999 if":
  - "you get sudden pain or discomfort in your chest that does not go away"
  - "the pain can feel like squeezing or pressure inside your chest, burning or indigestion"
  - "you get pain that spreads to your left or right arm, or your neck, jaw, stomach or back"
  - "you have chest pain and you feel sweaty, sick, light headed or short of breath"
  - Source: [NHS chest pain](https://www.nhs.uk/conditions/chest-pain/)
- **Shortness of breath, NHS.uk [fetched].** "Call 999 or go to A&E immediately if":
  - "you have severe difficulty breathing – you're gasping, choking or not able to get words out"
  - "your chest feels tight or heavy"
  - "you have pain that spreads to your arms, back, neck and jaw"
  - "your lips or skin are turning very pale, blue or grey"
  - "you feel suddenly confused"
  - Source: [NHS shortness of breath](https://www.nhs.uk/conditions/shortness-of-breath/)
- **Stroke, NHS.uk [fetched]:**
  - FAST: "face, arms, speech and time to call 999." BE-FAST is **not** used.
  - Other symptoms: "weakness or numbness down 1 side of your body"; "blurred vision or loss of sight in 1 or both eyes"; "finding it difficult to speak or think of words"; "confusion and memory loss"; "feeling dizzy or falling over"; "a severe headache"; "feeling or being sick (nausea or vomiting)".
  - Transient symptoms: "Even if this happens, get medical help straight away." Call 999 if stroke signs occurred "within the last 24 hours even if they've now stopped."
  - Source: [NHS stroke symptoms](https://www.nhs.uk/conditions/stroke/symptoms/)
- **Head injury, NHS.uk [fetched].** "Call 999 if" someone has hit their head and:
  - "has been knocked out and has not woken up"
  - "cannot stay awake or keep their eyes open"
  - "has a fit (seizure)"
  - "has problems with their vision or hearing"
  - "has new numbness or weakness in any part of their body"
  - "has problems with walking, balance, understanding, speaking or writing"
  - "their behaviour has changed, like being more irritable or distracted, or losing interest in things around them"
  - The NHS 111 list includes "are being sick (vomiting)" and "feel dizzy".
  - The page has no "headache that won't go away" or memory-loss bullet in the extract returned.
  - Source: [NHS head injury](https://www.nhs.uk/conditions/head-injury-and-concussion/)
- **Sepsis, NHS.uk [fetched].** "Call 999 or go to A&E if" (adult or child aged 5 years or over):
  - "is breathing very fast"
  - "is confused, has slurred speech, or is not making sense"
  - "has blue, pale or blotchy skin" (with a note on black or brown skin and palms)
  - "has a very high or very low temperature, feels hot or cold to the touch, or is shivery"
  - "has a rash that does not fade when you press it"
  - "has symptoms you're worried might be sepsis"
  - Also on the page: "A child or adult with sepsis might not have every symptom listed." and "Get immediate medical help if you or your child are unwell and you think there's something seriously wrong."
  - Source: [NHS sepsis](https://www.nhs.uk/conditions/sepsis/)
- **UK Sepsis Trust, adult "SEPSIS" signs [snippet]:**
  - slurred speech or confusion
  - extreme shivering or muscle pain
  - passing no urine (in a day)
  - severe breathlessness
  - it feels like you're going to die
  - skin mottled or discoloured
  - The campaign line is "Just ask: could it be sepsis?", with advice to call 999 or go to A&E.
  - Source: [UK Sepsis Trust, spotting the signs](https://sepsistrust.org/about-sepsis/spotting-the-signs-of-sepsis/)
- **NICE NG232 (head injury, 2023) discharge-advice list:** [not retrieved: nice.org.uk 403]. The repo already cites NG232 §§1.5 and 1.9.
- **NICE NG51 public red flags:** not retrieved.
- **Severe bleeding:** the NHS.uk page was not retrieved.

### Inferences
- Recheck's `trouble_breathing` ("Harder to breathe") is softer than NHS's 999 threshold. That suits a waiting-room flag but loses the observable cue that a companion can see: gasping or unable to finish sentences.
- Skin colour change (pale, blue, grey or blotchy lips or skin) appears in both the NHS sepsis and breathlessness 999 lists. A companion can observe it, and Recheck's list lacks it.
- NHS.uk's catch-alls ("symptoms you're worried might be…", "you think there's something seriously wrong") and the Sepsis Trust's "feels like you're going to die" all support the always-visible "I'm worried" button as the catch-all, rather than another tick-box.
- NHS lists separate "call 999" from "call 111". In the ED, every Recheck finding goes to staff, so the severity tiering belongs in server routing, not in patient-facing wording.

### Gaps
- NHS.uk wording for the FAST face, arm and speech lines, subarachnoid haemorrhage ("sudden severe headache"), and severe bleeding pages was not retrieved verbatim.
- NICE NG51 and NG232 patient-facing lists were not retrieved (403).

---

## 6. NHS 111 online / NHS Pathways public question style

### Takeaway
NHS 111 online screens for emergencies first. It shows a list of emergency prompts, and the user must actively choose "I have none of these" before the symptom questions begin. Each answer determines the next question. No public source on handling "I'm not sure" was found.

### Cited Findings
- Users "Carefully read the prompts about when you might need emergency care. If you are ok to carry on, select I have none of these." [snippet] — [Chopwell PHC guide to 111 online](https://primaryhealthcarecentrechopwell.nhs.uk/Resources/getting-medical-help-using-111-online-in-the-nhs-app/)
- The flow is age, sex, postcode, then main symptom, then a series of questions that follow from earlier answers. About 120 topics. No diagnosis is given: "you will find out what help you need." [snippet] — [NHS.uk, how NHS 111 online works](https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-use-111/how-nhs-111-online-works/)
- NHS Pathways is licensed, closed content (already noted in repo `SOURCES.md`).

### Inferences
- "Emergency list first, explicit 'none of these' to continue" is the same pattern as Recheck's warning-sign step plus "Send warning signs now". To match NHS 111, the warning-sign step should require an explicit "None of these" choice rather than allowing an empty tick-box list. An empty list cannot be told apart from a skipped question, and the repo's rules require distinguishing negative from unknown answers.

### Gaps
- How 111 online handles "I'm not sure" or "I don't know" answers. Not publicly documented in anything retrieved.

---

## 7. NHS digital service manual: urgent-message content style

### Takeaway
NHS care cards come in three tiers: non-urgent, urgent, and emergency. Each heading is one clear call to action, followed by short bullets. The guidance allows a catch-all "any other symptoms you're worried about" bullet. The aim is "to give essential information and reassure people, not to scare them." The manual discourages relying on readability tools and asks teams to test with users.

### Cited Findings
- Care card guidance [fetched] — [NHS service manual, care cards](https://service-manual.nhs.uk/design-system/components/care-cards):
  - Emergency: "If users need to get emergency help straight away, use the emergency care card." "Only use this card for emergencies."
  - Heading: "The card's heading should be 1 clear call to action." Use the format "Call 111 if:" followed by bullets. "Do not overload the heading." Examples include "Call 999 or go to A&E now if:".
  - Bullets: "Try to keep bullet points short and to limit your list to the most likely symptoms or scenarios, but follow clinical advice."
  - Catch-all: "In an urgent care card, you can add a final catch-all bullet point such as 'you or your child have any other symptoms you're worried about'."
  - Language: "Avoid vague or subjective language."
  - Tone: "We want to give essential information and reassure people, not to scare them."
  - Links: "Do not include other links in an emergency care card."
- Health literacy guidance [fetched] — [NHS service manual, health literacy](https://service-manual.nhs.uk/content/health-literacy):
  - Content should be "written at a level most users can understand."
  - "We do not recommend readability tools, except to help you prioritise your content."
  - "It's best to test it with your users."
  - No reading-age number was given on the page retrieved.

### Inferences
- Recheck's urgent screen ("Tell a staff member now" / "Go to the nearest staff member or call out for help.") already follows the emergency-card pattern: one call to action and no links. Keep any extra controls (retry, follow-up) visually separate from the instruction, mirroring "do not include other links in an emergency care card."
- "Avoid vague or subjective language" argues against "Worst headache of my life", which is subjective and a clinical idiom, and for observable descriptions.

### Gaps
- The NHS "How we write" and "Writing NHS messages" pages were not opened. Any explicit reading-age target is therefore unconfirmed. NHS content is often described as aiming at about a 9-year-old reading age, but no source for that was retrieved this session.

---

## 8. UK evidence that patient-reported wellness or family concern predicts deterioration

### Takeaway
UK evidence is thin and observational:
- one small single-centre PWQ study, in which self-rated wellness predicted the next NEWS;
- Martha's Rule operational data, in which 82% of acute-deterioration calls occurred when the EWS would not have triggered.

The strongest prospective caregiver-concern cohort is Australian and paediatric, so it is out of scope for adults. It is listed only as context.

### Cited Findings
- **PWQ:** self-rated wellness predicted the next NEWS (β = 0.180) and NEWS about 24 h later (combined β = 0.229) in 103 oncology inpatients. Preliminary; low completion (14%). [fetched] — [Albutt et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC8612917/)
- **Martha's Rule operational data:** 82% of acute-deterioration calls had a pre-call EWS that would not have triggered escalation. 13–14% of those led to transfer of care and 55–56% to another treatment change (June 2025–May/June 2026). [snippet] — [NHS England](https://www.england.nhs.uk/patient-safety/marthas-rule/). There is no control group.
- **Non-UK, paediatric (context only):**
  - Design: a Monash Health (Melbourne) cohort asked caregivers "Are you worried your child is getting worse?" at observations. About 190,000 responses; under 5% reported concern.
  - Result: ICU admission was 6.9% with concern versus 1.8% without. Concern predicted ICU admission better than any abnormal vital sign after adjustment.
  - Policy: NSW is mandating the question.
  - Source: [snippet] — [Monash University news](https://www.monash.edu/news/articles/research-finds-a-parents-intuition-for-their-childs-health-is-hard-to-beat)
- **National Martha's Rule evaluation:** launched in 2026 (NIHR, Leicester). Not yet reported. [snippet] — [University of Leicester](https://le.ac.uk/news/2026/august/martha-rule-evaluation-leicester-nihr)

### Inferences
- No UK study tests patient or companion self-report in an ED waiting room. Recheck's own measurement plan (missed signals and alert load) would be novel evidence.
- The Monash question wording, "Are you worried … is getting worse?", closely matches Recheck's "I'm worried I'm getting worse" button. Both use worry plus direction of change.

### Gaps
- No UK adult study of family-concern criteria (for example a "worried" criterion in NEWS2-era calling criteria) was retrieved.
- No "PRD" (patient-reported deterioration) UK study was found in the searches run.

---

## Audit: Recheck items and copy against UK evidence

Key: **Keep** / **Change** (suggested wording) / **Add** / **Remove**. Items with no UK evidence (privacy, circle check, sign-out, language) are omitted. The circle check rests on DelApp, not UK practice.

### Wellness questions (`base`)

| Item / key | Current | Verdict | Suggested wording / note | Source |
|---|---|---|---|---|
| `feeling_now` | "How are you feeling right now?" Very good / Good / OK / Poor / Very poor | **Keep.** Log that "OK" replaces PWQ "fair". | Optional: use "Fair" to stay instrument-faithful. "OK" is plainer, and either is defensible. | [Albutt PWQ](https://pmc.ncbi.nlm.nih.gov/articles/PMC8612917/) |
| `feeling_change` | "Compared with when staff last checked on you, how do you feel?" | **Change (minor).** PWQ anchors to "the last time you were asked", and trusts adapt the anchor ("yesterday"). A waiting patient may not know when staff last checked. | "Compared with your last check-in, how do you feel?" If the team wants to keep the staff anchor, add help text: "If no one has checked yet, compare with when you arrived." | [Albutt](https://pmc.ncbi.nlm.nih.gov/articles/PMC8612917/); [Bradford](https://www.bradfordhospitals.nhs.uk/?p=42436) [snippet] |
| `feeling_change` options | Much better / Better / About the same / Worse / Much worse | **Keep** | Matches PWQ order and polarity. "About the same" = PWQ "no change". | Albutt |
| `feeling_now`, `feeling_change` "not sure" | No "Not sure" option in the questionnaire, though brief §4 asks for one | **Add** | "Not sure". Route it like an unknown answer, never as reassurance. No UK precedent for or against was found, so this rests on repo rules. | Repo brief §4; gap in §6 |
| Companion `feeling_now` | "How do they seem right now?" | **Keep, and add help text** | Help text: "Tell us if they seem different from usual, or not themselves." | [Leeds Call 4 Concern](https://www.leedsth.nhs.uk/patients/call-4-concern-marthas-rule/) |

### Warning signs (`new_findings`)

| Item / key | Current | Verdict | Suggested wording / note | Source |
|---|---|---|---|---|
| Prompt | "Since you arrived, has any of this started or got worse? Tick all that apply." | **Change** | Add an explicit "None of these" option, so a negative answer is recorded and not inferred from an empty list. This is the 111 online pattern. | [111 online flow](https://primaryhealthcarecentrechopwell.nhs.uk/Resources/getting-medical-help-using-111-online-in-the-nhs-app/) [snippet] |
| `speech_change` | "Speech is different or hard to understand" | **Keep** | Covers stroke ("difficult to speak or think of words") and sepsis ("slurred speech… not making sense"). | NHS stroke, NHS sepsis [fetched] |
| `facial_droop` | "Face looks droopy on one side" | **Keep** | Aligns with FAST "face". The NHS face line was not retrieved verbatim. | NHS stroke |
| `new_weakness_numbness` | "New weakness or numbness on one side" | **Change** | "New weakness or numbness in the face, an arm or a leg". The NHS head-injury list says "any part of their body", so "one side" alone under-captures the head-injury group. | NHS head injury, NHS stroke [fetched] |
| `trouble_breathing` | "Harder to breathe" | **Change (minor)** | "Harder to breathe, or breathing very fast". The companion-observable cue comes from NHS sepsis and breathlessness. | NHS sepsis, NHS shortness of breath [fetched] |
| `fainting` | "Fainted or nearly fainted" | **Keep** | NHS chest pain lists "light headed". | NHS chest pain |
| `new_confusion` | "More confused" | **Keep** | NHS lists "confused…not making sense" (sepsis) and "suddenly confused" (breathlessness). | NHS sepsis, NHS shortness of breath |
| `drowsiness` | "Hard to stay awake" | **Change (minor)** | "Hard to stay awake or keep eyes open". This is NHS head-injury 999 wording. | NHS head injury [fetched] |
| `worst_headache` | "Worst headache of my life" | **Change** | "Sudden, severe headache". It is observable, matches NHS stroke ("a severe headache"), avoids clinical idiom, and avoids "my" appearing in companion mode. The NHS SAH page wording was not retrieved. | NHS stroke [fetched]; service manual "avoid vague or subjective language" |
| `vomiting` | "Vomiting" | **Keep** | NHS: "being sick (vomiting)". Optional plainer form: "Being sick (vomiting)". | NHS head injury, NHS stroke |
| `vision_change` | "New problem seeing" | **Keep**; optional extension | "New problem seeing or hearing". The NHS head-injury list pairs vision and hearing. | NHS head injury |
| `balance_change` | "New problem with balance or walking" | **Keep** | NHS: "walking, balance…" (head injury); "dizzy or falling over" (stroke). | NHS head injury, NHS stroke |
| `chest_pain` | "New or worse chest pain" | **Change** | "New or worse chest pain, pressure or tightness". NHS uses "squeezing or pressure" and "tight or heavy". | NHS chest pain, NHS shortness of breath [fetched] |
| `heavy_bleeding` | "Heavy bleeding" | **Keep** | No NHS page retrieved. No evidence against. | — |
| (new) skin colour | — | **Add** | "Lips or skin turning pale, blue, grey or blotchy". Appears in the 999 lists for sepsis and breathlessness, and a companion can observe it. | NHS sepsis, NHS shortness of breath [fetched]; UK Sepsis Trust [snippet] |
| (new) seizure as universal sign | Currently only `seizure` in head-injury and confused groups | **Add** to `new_findings` | "A fit (seizure)". It is on the NHS head-injury 999 list and applies to any complaint. | NHS head injury [fetched] |
| (new) pain spreading, all groups | `pain_moved` exists only in the chest/back group | **Consider adding** | "Pain spreading to the arm, neck, jaw, back or stomach". NHS chest-pain 999 list. Clinical team to decide whether this duplicates `chest_pain`. | NHS chest pain [fetched] |
| (new) behaviour change, head injury, companion | — | **Add** to the head-injury follow-up | Companion: "Is their behaviour different, for example more irritable, distracted or not interested in things around them?" | NHS head injury [fetched] |

### Always-visible buttons

| Item / key | Current | Verdict | Suggested wording / note | Source |
|---|---|---|---|---|
| `help_now` | "I need help now" / "They need help now" | **Keep** | Matches the single-action emergency pattern. | Service manual care cards |
| `worried` | "I'm worried I'm getting worse" / "I'm worried they're getting worse" | **Keep** | Matches Barnsley ("Are you worried you or your loved one is getting more unwell?") and Leeds ("You are worried about their condition"). It also serves as the NHS-style catch-all for worry. | [Barnsley](https://barnsleyhospital.nhs.uk/patients/marthas-rule) [snippet]; [Leeds](https://www.leedsth.nhs.uk/patients/call-4-concern-marthas-rule/); NHS sepsis catch-all |
| (new) second review | — | **Add** | After an "I'm worried" report is acknowledged, offer "Still worried? Ask for a second review", routed to a different responder (charge nurse or backup physician). This is the core Martha's Rule mechanism: escalation to a team other than the first responder when concerns are not addressed. | Leeds; Nursing Times; EMJ |
| `desk_question` | "Question about my wait or care" | **Keep** | Supported: about 70% of Martha's Rule calls are not acute deterioration (30% were deterioration, Sep 2024–Jun 2026). RCEM expects patients to know whom to ask about why they are waiting. | NHS England statistics [snippet]; RCEM 2025 |
| `leaving` | "I'm leaving" | **Keep** | — | — |

### Screen copy

| Item / key | Current | Verdict | Suggested wording / note | Source |
|---|---|---|---|---|
| `urgent.title` | "Tell a staff member now" | **Keep** | One clear call to action. | Service manual care cards |
| `urgent.body` | "Go to the nearest staff member or call out for help." | **Keep**; optional site detail | Optionally name the place, for example "Go to the triage desk or the nearest staff member, or call out for help." RCEM: patients should be "clear who they need to approach". | RCEM 2025 [fetched] |
| `desk.notClinical` | "If you feel worse or are worried about your health, press "I need help now" instead." | **Change** | "If you feel worse, press "I'm worried I'm getting worse". If you need help right away, press "I need help now"." The current text sends every worry to the emergency button and bypasses the worry route. | Internal consistency; Martha's Rule worry route |
| `leaving.info` / `message.leaving_info` | "…If you feel worse, return to triage right away." | **Change** | Add after-leaving safety-netting: "If you get worse after you leave, call 911 or come back to the emergency department." This is the RCEM discharge-advice pattern ("contact 999 or go to the ED"), localised to 911. | RCEM 2025 [fetched] |
| `patient.departmentWait`, `patient.waited` | Wait estimate and time waited | **Keep** | RCEM rec 2: automated, up-to-date wait information relevant to the patient. | RCEM 2025 [fetched] |
| `patient.placeInLine` | "Your answers never change your place in line." | **Keep** | Supports RCEM's "clear why they are waiting". | RCEM 2025 |
| `sent.stillChecking` | "Staff will still check on you on their own schedule." | **Keep** | Consistent with Martha's Rule, where the wellness question adds to staff observations and does not replace them. | Martha's Rule components |
| `patient.languageNotice` | English-only notice | **Keep** | RCEM rec 4: format appropriate to the patient. Translation remains future work. | RCEM 2025 |
| `flow.sendNow` | "Send warning signs now" | **Keep** | Matches the 111 online emergency-first pattern. | 111 online [snippet] |
| (new) non-app safety net | — | **Add (operational)** | A printed or poster version of the warning-sign list and "tell staff if you feel worse" in the waiting room. RCEM: "Departments should not assume all patients are able to access online material." | RCEM 2025 [fetched] |

### Brief §3a corrections

| Brief claim | Verdict | Fix |
|---|---|---|
| "72%… Sep 2024–May 2026" cited to the March 2026 release | **Change** | Re-cite to the NHS England Martha's Rule statistics page with its period: 72% family/carer, 30% acute deterioration, Sep 2024–Jun 2026, 17,490 calls. |
| "222 calls that led to a transfer of care" | **Remove** | Replace with the 82% EWS-would-not-have-triggered figure, and the 13–14% transfer / 55–56% other-change split of those calls. |
| Nursing Times A&E story | **Keep** | Add: trusts unnamed; escalation is a phone line after speaking to staff first. |
| "103 oncology inpatients, one hospital… 14%" | **Keep** | Confirmed: four oncology wards, one community hospital, Northern England, 2017. |
