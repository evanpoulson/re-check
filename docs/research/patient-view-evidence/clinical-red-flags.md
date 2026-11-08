# Clinical red flags a waiting adult or companion can observe, and an audit of Recheck's question bank

Scope: adults (CTAS 2–5) waiting for first physician/NP assessment at Foothills ED. Phone self-report or companion observation only. Exam findings, vitals and tests are named as staff work, not turned into questions. All proposed wording below is Recheck's own draft, built from the cited lay sources, and needs site clinical review. No mnemonic is reproduced.

Bank reviewed: `question-bank/questionnaire.json` v2026-11-08.1, `cedis-groups.json` v2026-11-08.1, `SOURCES.md`, brief §4.

## 1. Chest/back pain: aortic syndrome, ACS and PE red flags a patient can report

### Takeaway
The bank's chest/back follow-ups match the Canadian aortic syndrome guideline's pain features: migrating/radiating pain and abrupt worsening. They miss the guideline's other reportable features: tearing or ripping quality, severe or worst-ever pain, and symptoms of poor blood flow such as fainting or a cold, numb limb. They also miss the common ACS companion symptoms (sweating, pale, nausea) and PE signals (coughing up blood, leg swelling). The source cited as "CAEP/CJEM 2022" is actually a **CMAJ 2020** guideline.

### Cited Findings
- **Citation correction:** PMC7828987 is Ohle R, Yan JW, Yadav K, et al., "Diagnosing acute aortic syndrome: a Canadian clinical practice guideline," *CMAJ* 2020;192(29):E832–E843, doi:10.1503/cmaj.200021. It is not a 2022 CJEM/CAEP paper. — [Ohle et al., CMAJ 2020 (PMC7828987)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7828987/)
- **High-risk pain features:** the guideline lists four in Table 2: "severe or worst-ever" pain, "thunderclap or abrupt onset", "tearing or ripping", and "migrating or radiating". None scores 0 points, 1–2 score 1 point, and 3 or more score 2. — [Ohle et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC7828987/)
- **Evidence base for pain features:** the weighting of these features "was based entirely on expert consensus as we found no direct evidence on systematic review of the literature." The guideline does not define "migrating" separately from "radiating". — [Ohle et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC7828987/)
- **Exam findings belong to staff:** pulse deficit, neurological deficit on exam, aortic regurgitation murmur, hypotension (SBP <90 or shock index >1), and pericardial effusion on POCUS. — [Ohle et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC7828987/)
- **Population, syncope and perfusion deficits:** syncope and perfusion deficits are not scored. They define who the decision aid applies to: patients with chest, abdominal or back pain, "or perfusion deficit (central nervous system, cardiac, mesenteric, limb)", syncope, or BP differential/SBP >180. The guideline does not apply to pregnant patients, under-18s or recent (<24 h) cocaine use. — [Ohle et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC7828987/)
- **Heart attack signs (Public Health Agency of Canada):**
  - chest pain or discomfort, which may feel like "fullness, burning, pressure, tightness, squeezing, heaviness, or crushing"
  - shortness of breath
  - pain spreading to one or both arms, the neck, jaw or shoulders
  - looking pale, sweating or feeling unusually weak
  - nausea, vomiting or indigestion-like feelings
  - anxiety or a sense of dread

  — [Canada.ca, heart attack signs](https://www.canada.ca/en/public-health/services/diseases/heart-health/heart-attack/signs-symptoms-heart-attacks.html)
- **Signs more often seen in women:** heart attack without chest pressure; dizziness; extreme tiredness; pressure in the upper back; light-headedness or fainting; and pressure or pain in the jaw, lower chest or upper belly. Milder symptoms don't mean a less serious event. — [Canada.ca](https://www.canada.ca/en/public-health/services/diseases/heart-health/heart-attack/signs-symptoms-heart-attacks.html)
- **Heart & Stroke Foundation's heart attack list (via a secondary reproduction):** chest discomfort, upper body discomfort (neck, jaw, shoulder, arms, back), shortness of breath, sweating, nausea and light-headedness. I could not retrieve the official heartandstroke.ca page. — [Bayshore reproduction](https://www.bayshore.ca/resources/warning-signs-of-heart-disease-and-stroke/)
- **PE (Alberta MyHealth, via search snippet):** symptoms usually begin suddenly. The cough "may bring up blood or pink, foamy mucus". Fast heart rate, wheezing and fainting are also reported. — [MyHealth Alberta, pulmonary embolism](https://myhealth.alberta.ca/health/Pages/conditions.aspx?hwid=ue4084)
- **PE (Providence thrombosis program):** the commonest symptoms are "chest pain, shortness of breath, lightheadedness and possibly coughing up blood". Thrombosis Canada's clot campaign adds leg tenderness and leg swelling. — [Providence Health Care thrombosis](https://thrombosis.providencehealthcare.org/node/25)
- **Breathing red flags (NHS adult call-999 list):**
  - "severe difficulty breathing – you're gasping, choking or not able to get words out"
  - "your chest feels tight or heavy"
  - "pain that spreads to your arms, back, neck and jaw"
  - "lips or skin are turning very pale, blue or grey" (on brown or black skin, easier to see on the palms)
  - "you feel suddenly confused"

  — [NHS, shortness of breath](https://www.nhs.uk/symptoms/shortness-of-breath/)
- **Misdiagnosis burden:** AHRQ found that stroke, MI, aortic aneurysm/dissection, spinal cord compression and VTE together account for 39% of estimated serious ED misdiagnosis harms. — [AHRQ NBK588123](https://www.ncbi.nlm.nih.gov/books/NBK588123/), as summarised in brief §2

### Inferences
- **`pain_moved` and `pain_new_location`:** these map directly to "migrating or radiating" and are well worded.
  - Add "shoulder" and "upper belly / below the ribs" as locations. Canada.ca names the shoulders, and women may have pain in the lower chest or upper belly.
  - The current "Belly" option is ambiguous between upper and lower abdomen.
  - "Leg" pain spreading is plausible for aortic syndrome. A leg that becomes cold, numb, weak or pale is a different signal: a limb perfusion deficit. It deserves its own option and maps to CEDIS 011 "Cool pulseless limb".
- **`pain_sudden_worse`:** maps to "abrupt onset". The guideline's "tearing or ripping" quality and "worst-ever" severity are not asked.
  - Pain 0–10 partly captures severity, but a single number does not capture "worst ever".
  - A combined item could ask: "Does the pain feel like the worst you've ever had, or like tearing or ripping?" Mark it consensus-level evidence and patient-only, since a companion can only relay what the patient said.
- **Coverage from the universal list:** chest/back patients already see fainting, harder to breathe, vomiting and the stroke-type options.
  - Not covered anywhere: sweating or clammy, looking pale or grey, coughing up blood, and new leg swelling.
  - Sweating and pallor are companion-observable. Coughing up blood is observable by both.
- **`change_started`:** the bins (<15 min / 15–60 min / >1 h) are reasonable for an in-waiting-room change. No guideline gives a threshold for the change interval, so treat them as operational demo bins. Keeping it ask-after-routing is correct.
- **Reporter split:** none of these chest/back items can clear aortic syndrome or ACS. Companion text should stay "Have they said…" for pain items, because pain is patient-only. Sweating, pallor, blue or grey lips, gasping and fainting are directly companion-observable.

### Gaps
- I could not retrieve the official Heart & Stroke heart attack signs page, so the H&S wording rests on a secondary reproduction. The Canada.ca page is primary.
- I fetched only the first ~100k characters of the CMAJ guideline. I found no text stating that pain resolution does not exclude aortic syndrome; the unread tail may cover it.
- I did not fetch MyHealth Alberta's PE page directly; the finding comes from a search snippet.
- I found no Canadian lay source for abdominal-pain red flags. The brief already defers an abdominal/pelvic pathway.

## 2. New neurological change: FAST, BE-FAST, posterior circulation, last known well, thunderclap headache

### Takeaway
The universal list already covers the FAST elements in Recheck's own words: speech, face, one-sided weakness. It also adds vision and balance, which is the direction the BE-FAST evidence supports for posterior-circulation strokes. Three things need fixing:
- `last_known_well` is triggered only by speech, face or weakness, so it misses vision- and balance-only strokes.
- Its time bins don't align with the Canadian Stroke Best Practices windows (4.5 h, 6 h, 24 h) and have no "woke up with it" option.
- "Worst headache of my life" is a cliché rather than the guideline's construct, which is instantly peaking (thunderclap) headache.

### Cited Findings
- **FAST licence terms:** Heart & Stroke licenses its FAST mnemonic as "limited, revocable, non-transferable and non-exclusive", "for non-commercial and not-for-profit use only".
  - It must be used without modification and only to promote that campaign for its duration.
  - Users must not remove its marks or notices, or use it as a trademark for a product or service.

  Recheck's decision not to reproduce FAST is therefore correct. — [Heart & Stroke, share the FAST signs](https://www.heartandstroke.ca/stroke/signs-of-stroke/share-the-fast-stroke-signs)
- **What to do (H&S):** "Stroke is a medical emergency. If you experience any of these signs, call 9-1-1." — [Heart & Stroke, signs of stroke](https://www.heartandstroke.ca/stroke/signs-of-stroke)
- **Five warning signs (UBC/NINDS-sponsored public page):**
  - "Sudden confusion or trouble speaking or understanding"
  - "Sudden numbness or weakness, particularly on one side of the body"
  - "Sudden vision problems such as loss of vision, double vision, or blurred vision"
  - "Dizziness or trouble walking"
  - "Sudden severe headache with no apparent cause"

  — [UBC SPS3, 5 warning signs](https://sps3.med.ubc.ca/for-the-public/5-warning-signs-of-a-stroke)
- **BE-FAST vs FAST (Tanglay et al., *J Clin Med* 2024):** a single-centre retrospective Sydney study of 164 MRI-confirmed ischaemic strokes, 46 of them posterior circulation.
  - Sensitivity for posterior circulation stroke: FAST 58.7% (95% CI 43.2–73.0) vs BE-FAST 97.8% (88.5–99.9).
  - Specificity: 39.8% vs 10.0%.
  - Among posterior circulation strokes, 72.3% had balance problems or leg weakness and 23.4% had eye or visual signs.

  — [Tanglay et al. 2024 (PMC11477353)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11477353/)
- **Other BE-FAST evidence (search summary, not individually verified):**
  - A Henry Ford ED study found sensitivity 84% (FAST) vs 92.3% (BE-FAST), with specificity falling from 30.0% to 16.5%.
  - An Irish 2022 register found BE-FAST identified more strokes but did not improve time-to-treatment.

  — [search result, Henry Ford abstract](https://scholarlycommons.henryford.com/administration_mtgabstracts/4)
- **Dizziness is the riskiest presentation:** AHRQ found stroke misdiagnosis estimates were higher for dizziness/vertigo presentations than for weakness. — [AHRQ NBK588123](https://www.ncbi.nlm.nih.gov/books/NBK588123/), per brief §2
- **CSBP 2022, onset time:**
  - §4.1 rec 6: "Initial assessment should include consideration of time of stroke symptom onset."
  - §4.2 rec 3: patients who "arrive at hospital within 6 hours" get immediate CT/CTA.
  - §4.2 rec 4: patients "arriving 6 to 24 hours after stroke symptom onset (including stroke on awakening or with unknown onset time)" get advanced imaging for late-window thrombectomy.
- **CSBP 2022, performance measures:** thrombolysis measures apply to arrival "within 4.5 hours". The door-to-imaging measure uses "<6 hours from last known well". Stratified analysis is asked at 3.5, 4.5, 6 and 24 h. — [CSBP ED evaluation and management](https://www.strokebestpractices.ca/recommendations/acute-stroke-management/emergency-department-evaluation-and-management)
- **CSBP and FAST:** CSBP cites FAST as a validated scale for the rapid neurological exam (§4.1 rec 4). The retrieved text lists no vision, balance or headache signs.
- **Bystander awareness:** 6.6% of TIA patients were unaware of their symptoms, which bystanders witnessed. — [PubMed 32961590](https://pubmed.ncbi.nlm.nih.gov/32961590/), per brief §4
- **Ottawa SAH Rule, criteria (Perry et al., *JAMA* 2013;310(12):1248–55):** six items:
  - age ≥40
  - neck pain or stiffness
  - witnessed loss of consciousness
  - onset during exertion
  - "thunderclap headache (ie, instantly peaking pain)"
  - limited neck flexion on exam (staff)
- **Ottawa SAH Rule, performance and population:** sensitivity 100%, specificity 15.3%. It applies to alert, neurologically intact adults with non-traumatic headache peaking within 1 hour. — [Perry et al., PubMed 24065011](https://pubmed.ncbi.nlm.nih.gov/24065011/)
- **NHS headache call-999 list (adults included):**
  - "it started suddenly and is extremely painful"
  - "has had a seizure (fit)"
  - "has numbness or weakness in the body or face"
  - "are finding it difficult to speak, balance, walk or remember things"
  - "are drowsy or confused"
  - "has loss of vision"
  - "has had a head injury within the last 3 months"
  - "a very high temperature, a stiff neck, or bright lights are bothering you"
  - a non-blanching rash

  The page does not use "worst ever". — [NHS, headaches](https://www.nhs.uk/conditions/headaches/)
- **Brief §4 caveat:** about 14% of confirmed ischaemic strokes had no FAST symptoms recorded. — [Aroor et al., PubMed 28082668](https://pubmed.ncbi.nlm.nih.gov/28082668/)

### Inferences
- **`speech_change`:** keep. Consider adding understanding, as in "trouble speaking or understanding" (UBC/NINDS). Companion-observable.
- **`facial_droop`:** keep. A companion sees this better than the patient. Patient wording could be "One side of my face feels or looks droopy".
- **`new_weakness_numbness`:** keep "on one side" for stroke, since UBC says "particularly on one side". Numbness is patient-reported. Weakness can be observed by a companion (dropping things, dragging a leg).
- **`vision_change`:** "New problem seeing" is vague. Reword to name the types: loss of vision, double vision, or blurred vision (UBC/NINDS; CEDIS 504 definition). Patient-reported; a companion can relay it.
- **`balance_change`:** keep. Posterior circulation evidence supports it (72% had balance or leg-weakness features). Consider adding new dizziness or room-spinning, at least in the neuro group, given the AHRQ dizziness finding. Accept that dizziness is non-specific and should add a review, not an urgent page, unless combined with other findings. Companion-observable for walking.
- **`worst_headache`:** reword towards the validated construct (instantly peaking / sudden and extremely painful). A draft: "A sudden, severe headache that came on all at once". Patient-only (the companion relays it).
- **`last_known_well`:**
  - Extend `enableWhen` to `vision_change` and `balance_change`, otherwise a vision- or balance-only (posterior) stroke never gets onset time recorded.
  - Rebin to CSBP decision points instead of 3 h and 6 h, for example: <1 h, 1–4.5 h, 4.5–6 h, 6–24 h, >24 h. Add "Woke up with it / noticed after sleeping" and keep "Not sure" distinct.
  - Change "speaking and moving as usual" to cover vision and balance, e.g. "When were you last completely your usual self, before this started?"
  - Staff establish the definitive last-known-well time; the app's bin is a hint.
- **`symptoms_change` (neuro group):** non-specific but harmless, since the rule says "same/better" never cancels a staff check. Keep.
- **`headache_sudden_worse` (404 only):** keep. Ottawa SAH features (exertional onset, neck pain or stiffness, fainting) are history items for staff. Neck pain or stiffness could be a patient-reported option if clinical review wants it.

### Gaps
- I did not retrieve Heart & Stroke's official "other signs of stroke" page. The text I found came from secondary or older copies.
- I did not verify the BE-FAST mnemonic's licence. Avoid reproducing "BE-FAST" verbatim until checked.
- I fetched only part of the CSBP page (first ~100k characters). The 2025 interim update moved some boxes to §5.4, which I did not read.
- I found no study of companions screening for stroke in an ED waiting room.

## 3. Head injury: Canadian CT Head Rule, NICE NG232 and NHS red flags observable while waiting

### Takeaway
The head-injury follow-ups map well to the high-risk features that can change while someone waits: vomiting ≥2, drowsiness, confusion, seizure, worsening headache.
- `vomit_count` counts only since arrival, while both the Canadian CT Head Rule and NICE count episodes since the injury.
- Clear fluid from the nose or ears, and changed behaviour, are lay-observable red flags not yet asked.
- Neck trauma (CEDIS 105) is a spine problem, and the head-injury questions fit it only partly.

### Cited Findings
- **Canadian CT Head Rule (Stiell et al., *Lancet* 2001), high-risk factors:** five factors for neurosurgical intervention:
  - GCS <15 at 2 h after injury
  - suspected open or depressed skull fracture
  - any sign of basal skull fracture
  - "vomiting ≥2 episodes"
  - age ≥65

  These were 100% sensitive (95% CI 92–100%) for neurosurgical intervention. The rule applies to adults with GCS 13–15 after minor head injury.
- **Canadian CT Head Rule, medium-risk factors:** amnesia before impact ≥30 min and a dangerous mechanism.

  — [AAFP summary of Stiell 2001](https://www.aafp.org/afp/2001/1201/p1886a.html) · [Stiell 2001, PubMed 11356436 via QxMD](https://www.qxmd.com/r/11356436)
- **NICE NG232, CT within 1 hour in adults (secondary sources):** GCS ≤12 initially or <15 at 2 h, suspected skull fracture, post-traumatic seizure, focal neurological deficit, and "more than 1 episode of vomiting". Anticoagulant/antiplatelet use alone: consider CT within 8 h. NICE's site returned HTTP 403, so this comes from NICE's imaging algorithm listing and third-party summaries. — [NICE NG232 recommendations (403 on fetch)](https://www.nice.org.uk/guidance/ng232/chapter/recommendations) · [NICE NG232 imaging algorithm](https://nice.org.uk/guidance/ng232/resources/imaging-algorithm-pdf-13061125549)
- **NHS call-999 list after a head injury (lay wording):**
  - knocked out and has not woken up
  - "Cannot stay awake or keep their eyes open"
  - has a fit (seizure)
  - problems with vision or hearing
  - clear fluid coming from the ears or nose
  - bleeding from the ears or bruising behind the ears
  - new numbness or weakness in any part of the body
  - trouble with walking, balance, understanding, speaking or writing
  - "changed in behaviour, such as becoming more irritable or distracted, or losing interest in surroundings"

  Vomiting, dizziness and headache are listed for NHS 111 advice, not 999. — [NHS, head injury and concussion](https://www.nhs.uk/conditions/head-injury-and-concussion/)

### Inferences
- **`vomit_count`:** the bins (none / once / twice or more) match both thresholds (CCHR ≥2; NICE >1).
  - The criteria count episodes since the injury, so "since arriving" undercounts. Either ask "since the injury" or have the rules add the count recorded at triage.
  - Clinically, the incremental signal while waiting is any new vomiting after arrival. Keep the item and fix the denominator in the rules. Companion-observable.
- **`harder_to_wake`:** keep. The companion text ("harder to wake or keep awake") matches the NHS lay wording. The patient version is weak, since a drowsy patient is the least reliable reporter, so it should never be reassuring.
- **`headache_change`:** keep. Worsening headache is a commonly cited deterioration sign in NICE observation guidance (not verified directly; NICE was blocked). Patient-only; the companion relays it.
- **`seizure`:** keep. NICE (post-traumatic seizure → CT within 1 h) and NHS 999 both support it. Mainly companion-observable, since the patient may not know they had one. The patient-facing text should allow "Not sure".
- **`more_confused`:** keep. NHS describes behaviour change ("more irritable or distracted, or losing interest in surroundings"), and that is not the same as confusion. Add a companion option for behaviour change.
- **Add `fluid_from_nose_ears`:** "Clear watery fluid or blood coming from the nose or ears". Lay-observable; NHS 999 list. It corresponds to the CCHR "signs of basal skull fracture", which staff confirm.
- **Covered by the universal list:** new weakness or numbness, speech/understanding, vision and balance. NHS says "any part of the body" for head injury, which differs from the stroke "one side" wording.
- **Triage facts, not check-in items:** anticoagulant use, age ≥65, mechanism and amnesia.
- **CEDIS 105 "Neck trauma":** mapping it to `head_injury` is clinically weak. Neck trauma calls for spine red flags such as new arm or leg numbness or weakness (universal list) and neck-specific symptoms, not headache or vomiting. Flag for clinical review; candidate for a later spine pathway.
- **CEDIS 102 "Facial trauma":** mapping it to head injury is defensible, since facial impact often involves head injury, but it is wider than needed.

### Gaps
- I could not retrieve NICE NG232 primary text (HTTP 403), so the §1.4/§1.9 wording is unverified and comes from secondary sources. Treat the "severe or increasing headache / persistent vomiting / agitation" deterioration list as unverified until the NICE PDF is checked.
- I did not retrieve the OHRI Canadian CT Head Rule card or its reuse terms.

## 4. Confused/drowsy and delirium: what companions can report

### Takeaway
Family-reported acute change is a recognised delirium signal. The SQiD asks a friend or relative one question, essentially whether the person has been more confused lately, and the 4AT scores "acute change or fluctuating course" from informant or clinical history. Its accuracy is modest and varies widely. Use it as a trigger for staff review, never as a rule-out. The companion wording `more_confused` is well grounded. The patient self-report version is the weak link.

### Cited Findings
- **SQiD in cancer inpatients (*BMC Cancer* 2021):** wording "Do you feel that [patient's name] has been more confused lately?", asked of an informant. Sensitivity was about 44% and specificity 86–87% against psychiatrist interview, higher sensitivity than CAM in that study (44% vs 26%). — [BMC Cancer 2021 SQiD study](https://bmccancer.biomedcentral.com/articles/10.1186/s12885-020-07504-x)
- **SQiD in other studies (search summary):** the 2010 pilot (*Palliative Medicine*) reported sensitivity 80% (CI 28–99%) and specificity 71% in a very small sample. A general-medical-ward study reported sensitivity 77% and specificity 51%. — [BMC Cancer article and related search results](https://bmccancer.biomedcentral.com/articles/10.1186/s12885-020-07504-x)
- **4AT item 4:** scores evidence of acute change or fluctuation over the last 2 weeks still evident in the last 24 h (4 points).
  - The guide warns informants are not always reliable, and about 25% of patients at the front door may have no informant.
  - A drowsy patient known to live independently shows obvious acute change.
  - An untestable patient scores as possible delirium.
  - "A delirium-positive result is not diagnostic"; diagnosis is by clinical judgement.

  — [4AT user guide](https://www.the4at.com/userguide)

### Inferences
- **`more_confused` companion text:** "Are they more confused than when staff last checked?" A companion may not know when staff last checked. SQiD-style framing compares with the person's usual self. Proposed companion wording: "Do you think they are more confused than usual for them, or more than when you arrived?"
- **`more_confused` patient text:** keep it, but treat it as low-information. A confused patient may not recognise it, and the bank's rule already says a reassuring answer never cancels a check.
- **`new_confusion` / `drowsiness` (universal):** companion-observable and should stay. "Hard to stay awake" works as patient wording. For companions use "hard to wake or keep awake" (NHS head-injury wording).
- **4AT and the circle check:** the 4AT's principle that an untestable patient counts as possibly delirious supports the bank's rule that a missing or wrong `circle_count` creates a staff check. The circle task itself remains unvalidated for self-use (already noted in SOURCES.md).
- **Companion behaviour option:** add "acting differently from usual (agitated, withdrawn, seeing or hearing things)". It is consistent with the 4AT's acute-change construct and the NHS head-injury behaviour-change item. The specific examples are Recheck's draft and need clinical review.

### Gaps
- I found no ED-specific validation of SQiD or of family-reported change while waiting.
- The 4AT site states its use terms, but I did not verify them. Recheck doesn't reproduce 4AT items anyway.

## 5. Sepsis/infection, breathing, bleeding, allergy and other universal red flags

### Takeaway
The universal "new warning signs" list is missing three urgent signal clusters:
- **Infection/sepsis:** uncontrollable shivering; mottled, blue, grey or very pale skin or lips; "feels like I'm going to die".
- **Airway/allergy:** swelling of the face, lips, tongue or throat.
- **Bleeding from an orifice:** coughing or vomiting blood.

It also has no universal **seizure** option; seizure is asked only in the head-injury and confused groups. "Harder to breathe" is too mild: lay sources describe dangerous breathlessness as gasping or unable to get words out.

### Cited Findings
- **UK Sepsis Trust adult signs:**
  - "Slurred speech or confusion"
  - "Extreme shivering or muscle pain"
  - "Passing no urine (in a day)"
  - "Severe breathlessness"
  - "It feels like you're going to die"
  - "Skin mottled or discoloured"

  The page carries "© The UK Sepsis Trust" with no reuse licence stated. — [UK Sepsis Trust, spotting the signs](https://sepsistrust.org/about-sepsis/spotting-the-signs-of-sepsis/)
- **Breathing:** NHS call-999 wording includes "gasping, choking or not able to get words out" and "lips or skin are turning very pale, blue or grey". — [NHS, shortness of breath](https://www.nhs.uk/symptoms/shortness-of-breath/)
- **Sense of dread:** Canada.ca lists "anxiety or a sense of dread" among heart attack signs, overlapping the sepsis "feels like you're going to die" item. — [Canada.ca](https://www.canada.ca/en/public-health/services/diseases/heart-health/heart-attack/signs-symptoms-heart-attacks.html)
- **Anaphylaxis signs (Food Allergy Canada materials, via search snippet):**
  - swelling of the face, lips and tongue
  - coughing, wheezing and shortness of breath
  - throat tightness and trouble swallowing

  Breathing or heart symptoms alone can be anaphylaxis. — [Food Allergy Canada, symptoms sheet](https://foodallergycanada.ca/wp-content/uploads/Symptoms-Sheet.pdf)
- **Seizure:** the NHS headache and head-injury pages list a fit or seizure as call-999. — [NHS headaches](https://www.nhs.uk/conditions/headaches/) · [NHS head injury](https://www.nhs.uk/conditions/head-injury-and-concussion/)
- **Coughing up blood:** coughing up blood or pink, foamy mucus is a PE symptom (MyHealth Alberta snippet). — [MyHealth Alberta](https://myhealth.alberta.ca/health/Pages/conditions.aspx?hwid=ue4084)
- **CEDIS v1.1 complaints for these presentations:** 259 Vomiting blood, 260 Blood in stool/melena, 655 Hemoptysis, 657 Allergic reaction, 651 Shortness of breath, 008 Syncope/presyncope, 852 Fever and 715 Cyanosis. — [CEDIS v1.1, Grafstein et al., CJEM 2008](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/8C3A3F94720EA7F36BA7272C5D3E230F/S1481803500009878a.pdf/revision_of_the_canadian_emergency_department_information_system_cedis_presenting_complaint_list_version_11.pdf)
- **Abdominal pain volume:** CIHI lists abdominal/pelvic pain and throat/chest pain among the most frequent main-problem diagnoses. — [CIHI NACRS volumes](https://www.cihi.ca/en/nacrs-emergency-department-visits-and-lengths-of-stay), per brief §2

### Inferences
- **Reword `trouble_breathing`:** "Harder to breathe" is broad and will catch mild anxiety. Keep the code and split severity, adding "So breathless I can't finish a sentence, or gasping". That is NHS-sourced, observable by both patient and companion, and suits urgent routing.
- **Add `skin_colour`:** "Lips or skin turning blue, grey, very pale or blotchy". Covers the NHS breathing item and the Sepsis Trust "mottled or discoloured" item. Companion-observable and strong.
- **Add `shivering`:** "Shaking or shivering that won't stop". Sepsis Trust. Patient or companion. Non-specific alone; moderate evidence (charity awareness list, not validated as a self-report trigger).
- **Add `doom`:** "Feel like something terrible is happening / like I might die". Sepsis Trust and Canada.ca. Patient-only. Low specificity, so route to review rather than urgent.
- **Add `swelling_face_throat`:** "Swelling of lips, tongue, face or throat, or trouble swallowing". Food Allergy Canada. Observable by both. Strong face validity for urgent routing.
- **Add `seizure` to the universal list:** NHS 999. Companion-observable. Then keep or drop the group-specific `seizure` follow-up to avoid duplication.
- **Add `blood_cough_vomit`:** "Coughing up or vomiting blood". PE (MyHealth) and CEDIS 259/655. Observable by both.
- **`heavy_bleeding`:** keep, but it is vague. I found no lay source defining "heavy". Consider "Bleeding that won't stop", and leave the threshold to staff.
- **`chest_pain`:** keep it universal. Canada.ca says women and others may have heart attacks with milder or atypical symptoms, so new chest discomfort in any group matters. Consider "New or worse chest pain, pressure or tightness" to match Canada.ca descriptors.
- **"Passing no urine (in a day)":** not suitable for a check-in during an ED wait (hours). Leave it to staff fluid-balance assessment.
- **Infection pathway:** the general group lacks any fever or infection follow-up. A fever/infection pathway (CEDIS 852) needs its own clinical review, as the brief says. The universal additions above give a minimum net meanwhile.

### Gaps
- I did not retrieve Sepsis Canada or a Canadian lay sepsis list; the UK Sepsis Trust list is UK and © with no reuse terms.
- I did not fetch Food Allergy Canada's PDF directly (search snippet only).
- I found no Canadian or physician-authored source with lay abdominal-pain red flags.
- I found no evidence on how adding universal options affects alert volume or false positives in a waiting room. The brief's eTriage data suggest overtriage is a real cost.

## 6. CEDIS code verification and the CTAS 2025 revision

### Takeaway
All 24 complaint-group codes and the 13 exclusion codes in `cedis-groups.json` match CEDIS v1.1 code numbers and names. The only difference is a spelling: v1.1 prints 410 as "Sensory loss/parasthesias". Two issues for the site:
- CEDIS **2024** (the current list as distributed by at least one Canadian health region) renames "Major trauma – penetrating/blunt" to "Multi-system trauma – penetrating/blunt" and adds isolated chest/abdominal trauma complaints. If Foothills uses the 2024 list, codes 801/802 must be re-confirmed.
- Several high-risk complaints fall into `general`: syncope (008), cool pulseless limb (011), shortness of breath (651), hemoptysis (655), hyperglycemia (853), vomiting blood (259) and allergic reaction (657).

### Cited Findings
- **CEDIS v1.1 (Grafstein, Bullard, Warren, Unger, CTAS NWG; *CJEM* 2008;10(2):151–) confirms:**
  - 003 Chest pain (cardiac features)
  - 004 Chest pain (noncardiac features)
  - 102 Facial trauma
  - 105 Neck trauma
  - 301 Flank pain
  - 351 Depression/suicidal/deliberate self harm
  - 355 Violent/homicidal behaviour
  - 401 Altered level of consciousness
  - 402 Confusion
  - 403 Vertigo
  - 404 Headache
  - 405 Seizure
  - 406 Gait disturbance/ataxia
  - 407 Head injury
  - 409 Extremity weakness/symptoms of CVA
  - 410 Sensory loss/parasthesias
  - 458 Pregnancy issues > 20 wk
  - 504 Visual disturbance
  - 508 Diplopia
  - 551 Back pain
  - 751 Substance misuse/intoxication
  - 801 Major trauma – penetrating
  - 802 Major trauma blunt
  - 854 Hypoglycemia
  - paediatric codes 601, 602, 603, 605, 606, 607, 609, 611, all with names as in the repo

  — [CEDIS v1.1 PDF](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/8C3A3F94720EA7F36BA7272C5D3E230F/S1481803500009878a.pdf/revision_of_the_canadian_emergency_department_information_system_cedis_presenting_complaint_list_version_11.pdf)
- **v1.1 definitions:**
  - 403 Vertigo "Refers primarily to patients with a sensation of movement of oneself or external objects as opposed to unsteadiness".
  - 504 Visual disturbance "Includes loss of vision, flashing lights, sensation of a curtain coming down over the field of vision".
  - 458 includes labour, imminent delivery, late-term bleeding and abruption.

  — [CEDIS v1.1](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/8C3A3F94720EA7F36BA7272C5D3E230F/S1481803500009878a.pdf/revision_of_the_canadian_emergency_department_information_system_cedis_presenting_complaint_list_version_11.pdf)
- **Related v1.1 codes outside the map:** 007 General weakness, 008 Syncope/presyncope, 011 Cool pulseless limb ("identifies potential acute vascular injuries"), 251 Abdominal pain, 259 Vomiting blood, 651 Shortness of breath, 655 Hemoptysis, 657 Allergic reaction, 715 Cyanosis, 852 Fever and 853 Hyperglycemia. — [CEDIS v1.1](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/8C3A3F94720EA7F36BA7272C5D3E230F/S1481803500009878a.pdf/revision_of_the_canadian_emergency_department_information_system_cedis_presenting_complaint_list_version_11.pdf)
- **CEDIS "Version 2024" (Southern Health–Santé Sud, Manitoba, document dated June 2025):** lists complaint names without numeric codes.
  - Names include "Extremity weakness / symptoms of CVA", "Sensory loss / paresthesia", "Pregnancy issue >20 weeks", "Substance misuse/Intoxication" and "Hypoglycemia".
  - The trauma section lists "Multi-system trauma – blunt", "Multi-system trauma – penetrating", "Isolated chest trauma" and "Isolated abdominal trauma". "Major trauma" no longer appears by that name.

  — [CEDIS Presenting Complaints List v2024 (Southern Health)](https://staffnet.southernhealth.ca/wp-content/uploads/CEDIS-Presenting-Complaints-List.pdf)
- **CTAS 2025:** CAEP reports that "CTAS Guidelines 2025" (Hall JN, McCarron J, Toarta C, McLeod SL; CTAS NAC & NENA Triage Committee) were published in *CJEM* 2025;27(10):774–777 (doi:10.1007/s43678-025-00996-1). CAEP calls it the most substantial modernisation in over a decade. — [CAEP 2026 annual report, CTAS NAC](https://www.caep.ca/2026-annual-report/ctas-nac-committee)
- **CTAS reuse:** HL7's terminology entry (secondary) states that reuse of CTAS materials requires express permission from CAEP/CTAS. It describes reassessment as continuous for Level 1 and every 15 min for Level 2, decreasing with lower acuity. — [HL7 THO, CTAS naming system](https://terminology.hl7.org/NamingSystem-CTAS.xml.html)

### Inferences
- **Codes are correct for v1.1.** Optionally align the 410 display with the source spelling, or note that the repo modernises it. The 2024 renaming of major trauma is the real risk to the exclusion map.
- **High-risk complaints in `general`:**
  - Syncope (008) is part of the aortic-syndrome population, so consider mapping it to `chest_back_pain` or flagging it for review.
  - 011 Cool pulseless limb is a perfusion-deficit complaint, often CTAS 2, and is probably better kept on the staff list.
  - Hyperglycemia (853) can cause confusion (DKA/HHS) like 854 does. Whether it belongs in `confused_drowsy` is a clinical decision.
- **404 Headache and SAH:** 404 maps to `neuro_change`. Patients with thunderclap headache are the SAH-rule population.
- **CTAS 2025 and Recheck's intervals:** Recheck's CTAS-based check-in intervals cite AHS HCS-181-01. Confirm they don't conflict with CTAS 2025 reassessment guidance once the CJEM text is read.

### Gaps
- I could not confirm whether CEDIS 2024 keeps the v1.1 numeric codes; the distributed 2024 list shows names only. The CIHI product page was not checked.
- I did not retrieve the CTAS 2025 CJEM text, so changes to reassessment intervals or waiting-room guidance are unknown.
- I did not verify Alberta/Connect Care's CEDIS version.

## 7. CAEP positions and Canadian physician commentary on waiting-room safety and patient self-report

### Takeaway
CAEP treats crowding and access block as a patient-safety emergency associated with higher mortality, and set physician-assessment time targets. I found no CAEP statement that addresses structured reassessment of waiting patients or patient/companion self-reporting. That absence is itself a finding: Recheck sits in a policy gap that AHS's own reassessment guideline, not CAEP, covers.

### Cited Findings
- **CAEP 2015 position (Affleck, Parks, Drummond, Rowe, Ovens):**
  - "EDOC is associated with increased mortality and worse outcomes for patients assessed in a crowded ED whether admitted or discharged."
  - "Access Block and EDOC represent a public health emergency."
  - Boarded inpatients "block access to these care spaces by ill and injured patients in the waiting room."
  - Time to physician initial assessment "correlates to 'left without being seen' rates."
  - Benchmarks: time to physician assessment median 1 h, 90th percentile 3 h.
  - It does not address reassessment of waiting patients.

  — [CAEP, ED overcrowding and access block (2015)](https://www.caep.ca/position-statements/emergency-department-overcrowding-and-access-block)
- **CAEP 2026 update:** a statement dated June 2026 (draft circulated March 2026) frames overcrowding as a patient-safety threat. It says the harms of crowding and access block "are frequently underestimated", per the search summary. — [CAEP March 2026 draft PS](https://caep.ca/wp-content/uploads/2026/03/CAEP-EDOC-PS_Mar-27_For-Member-Review.pdf) · [CAEP ED overcrowding page](https://www.caep.ca/position-statements/emergency-department-overcrowding)
- **CAEP 2023 closures statement:** called for ED closures and rising access block to be declared an acute care emergency (search summary). — [CAEP crowding/closures statement 2023](https://caep.ca/wp-content/uploads/2023/09/Crowding_Closures_Statement_Sept5.pdf)
- **CanadiEM commentary:** a CanadiEM piece, "Waiting in the emergency department", describes the problem reaching the waiting room because admitted patients have nowhere to go. I did not fetch the full text. — [CanadiEM, Waiting in the ED](https://canadiem.org/waiting-in-the-emergency-department/)

### Inferences
- Recheck can cite CAEP for the problem (crowding harms, waiting-room access) but not for the intervention. The intervention's justification rests on:
  - AHS HCS-181-01 (reassessment requirement)
  - Martha's Rule (patient/family escalation)
  - the condition-specific lay red-flag sources above

### Gaps
- I did not fetch the June 2026 CAEP statement text.
- I found no CAEP position specific to the waiting room or patient self-report.
- I found no Canadian physician-authored commentary on patients self-reporting deterioration while waiting.

## Audit of the question bank

### Takeaway
Most items are sound and evidence-aligned. Main changes:
- Fix `last_known_well` triggers and bins.
- Reword `worst_headache`, `vision_change` and `trouble_breathing`.
- Fix the `vomit_count` denominator.
- Add universal options for seizure, airway swelling, skin colour, blood from mouth, and severe breathlessness.
- Add head-injury fluid from nose or ears, plus companion behaviour change.
- Add aortic-syndrome pain character and limb perfusion items.
- Correct the aortic syndrome citation.
- Review the 105 and 008 mappings and the CEDIS 2024 trauma names.

### Cited Findings
All sources are as cited in sections 1–7. Key: AAS = [Ohle CMAJ 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7828987/); PHAC = [Canada.ca heart attack](https://www.canada.ca/en/public-health/services/diseases/heart-health/heart-attack/signs-symptoms-heart-attacks.html); NINDS5 = [UBC/NINDS 5 signs](https://sps3.med.ubc.ca/for-the-public/5-warning-signs-of-a-stroke); BEFAST = [Tanglay 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11477353/); CSBP = [CSBP ED](https://www.strokebestpractices.ca/recommendations/acute-stroke-management/emergency-department-evaluation-and-management); OSAH = [Perry 2013](https://pubmed.ncbi.nlm.nih.gov/24065011/); NHS-HA = [NHS headaches](https://www.nhs.uk/conditions/headaches/); CCHR = [Stiell 2001 summary](https://www.aafp.org/afp/2001/1201/p1886a.html); NICE = [NG232](https://www.nice.org.uk/guidance/ng232/chapter/recommendations) (unverified, 403); NHS-HI = [NHS head injury](https://www.nhs.uk/conditions/head-injury-and-concussion/); SQiD = [BMC Cancer 2021](https://bmccancer.biomedcentral.com/articles/10.1186/s12885-020-07504-x); 4AT = [4AT guide](https://www.the4at.com/userguide); UKST = [UK Sepsis Trust](https://sepsistrust.org/about-sepsis/spotting-the-signs-of-sepsis/); NHS-SOB = [NHS breathlessness](https://www.nhs.uk/symptoms/shortness-of-breath/); FAC = [Food Allergy Canada](https://foodallergycanada.ca/wp-content/uploads/Symptoms-Sheet.pdf); MyHealth = [MyHealth Alberta PE](https://myhealth.alberta.ca/health/Pages/conditions.aspx?hwid=ue4084); CEDIS = [v1.1](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/8C3A3F94720EA7F36BA7272C5D3E230F/S1481803500009878a.pdf/revision_of_the_canadian_emergency_department_information_system_cedis_presenting_complaint_list_version_11.pdf); H&S licence = [H&S FAST licence](https://www.heartandstroke.ca/stroke/signs-of-stroke/share-the-fast-stroke-signs).

### Inferences

**Item-by-item audit** (reporter: P = patient-reported, C = companion-observable, P→C = companion can only relay what the patient said). All proposed wording is Recheck's draft and needs clinical review.

| Item / option | Verdict | Proposed wording / change | Reporter | Rationale | Source |
|---|---|---|---|---|---|
| `help_now` | Keep | — | P, C | Persistent escalation route | Martha's Rule (brief §3a) |
| `worried` | Keep | — | P, C | Family route; most Martha's Rule calls come from family | brief §3a |
| `desk_question` | Keep | — | P, C | Non-clinical route | brief §3a |
| `leaving` | Keep | — | P, C | Operational | — |
| `feeling_now` | Keep | — | P, C | PWQ adaptation; preliminary evidence | brief §3a |
| `feeling_change` | Keep | Companion: consider "than when you arrived" if they don't know when staff last checked | P, C | Companion may not know the staff-check time | brief §3a; 4AT (informant timing) |
| `pain` (0–10) | Keep | — | P only | Patient-only is correct. Doesn't capture "worst ever" or character (see new items). | AHS HCS-181-01; AAS |
| `new_findings` stem | Keep | — | P, C | Universal net; new symptom opens a branch | brief §4 |
| ↳ `speech_change` | Reword (minor) | "Speech is different, or trouble understanding others" | C (strong), P | "Trouble speaking or understanding" | NINDS5 |
| ↳ `facial_droop` | Keep | Patient: "One side of my face feels or looks droopy" | C (strong), P | FAST element in own words; licence bars reproducing FAST | H&S licence; CSBP |
| ↳ `new_weakness_numbness` | Keep | — | P (numbness), C (weakness) | "Particularly on one side" | NINDS5 |
| ↳ `trouble_breathing` | Reword + split | Keep "Harder to breathe" and add a severe option (new item below) | P, C | NHS severe-breathlessness lay wording | NHS-SOB |
| ↳ `fainting` | Keep | — | P, C | Defines the AAS population; PE and women's ACS feature | AAS; PHAC; MyHealth |
| ↳ `new_confusion` | Keep | Companion: "More confused than usual for them" | C (strong), P (weak) | SQiD informant construct; patient may lack insight | SQiD; 4AT |
| ↳ `drowsiness` | Keep | Companion: "Hard to wake or keep awake" | C (strong), P | NHS lay wording | NHS-HI |
| ↳ `worst_headache` | Reword | "A sudden, severe headache that came on all at once" | P→C | Validated construct is instantly peaking (thunderclap); NHS "started suddenly and is extremely painful" | OSAH; NHS-HA |
| ↳ `vomiting` | Keep | — | P, C | Non-specific alone; matters in head injury (count) and ACS (nausea/vomiting) | CCHR; PHAC |
| ↳ `vision_change` | Reword | "Sudden loss of vision, double vision or blurred vision" | P→C | Names the types; matches CEDIS 504 | NINDS5; CEDIS |
| ↳ `balance_change` | Keep | Optionally add "or new dizziness / room spinning" in the neuro group | C (walking), P | Posterior circulation; FAST misses ~40% of posterior strokes in one cohort | BEFAST; NINDS5; AHRQ |
| ↳ `chest_pain` | Reword (minor) | "New or worse chest pain, pressure or tightness" | P→C | PHAC descriptors | PHAC |
| ↳ `heavy_bleeding` | Keep / reword | "Bleeding that won't stop" | P, C | No lay source defines "heavy"; leave the threshold to staff | (no source found) |
| `circle_count` | Keep | — | P only | Untestable = staff check matches the 4AT principle; self-use unvalidated | 4AT; SOURCES.md |
| `pain_moved` | Keep | — | P→C | "Migrating or radiating" high-risk feature (consensus) | AAS |
| `pain_new_location` | Reword options | Add "Shoulder" and "Upper belly / below the ribs"; split "Belly" into upper and lower | P→C | Arm/neck/jaw/shoulder spread; women: lower chest/upper belly | PHAC; AAS |
| `pain_sudden_worse` | Keep | — | P→C | "Thunderclap or abrupt onset" | AAS |
| `change_started` | Keep | — | P, C | Operational bins; no guideline threshold; ask-after-routing correct | — |
| `symptoms_change` | Keep | — | P, C | Non-specific; rule already blocks "same/better" from clearing | brief §4 |
| `headache_sudden_worse` | Keep | — | P→C | SAH construct; 404 only is fine | OSAH |
| `last_known_well` | Reword + re-trigger + rebin | Stem: "When were you last completely your usual self, before this started?" Trigger also on `vision_change` and `balance_change`. Bins: <1 h; 1–4½ h; 4½–6 h; 6–24 h; >24 h; "Woke up with it"; Not sure | P, C | CSBP decision points (4.5/6/24 h); wake-up/unknown onset is explicitly a category; posterior strokes present with vision/balance | CSBP; BEFAST |
| `harder_to_wake` | Keep | — | C (strong), P (weak) | NHS "cannot stay awake or keep their eyes open" | NHS-HI; NICE (unverified) |
| `vomit_count` | Keep options; fix denominator | Either "since the injury" or rules add the triage-recorded count | P, C | CCHR ≥2 and NICE >1 count since the injury | CCHR; NICE |
| `headache_change` | Keep | — | P→C | Worsening headache = deterioration (NICE, unverified) | NICE |
| `seizure` | Keep (or move to universal) | — | C (strong), P | Post-traumatic seizure → CT ≤1 h; NHS 999 | NICE; NHS-HI |
| `more_confused` | Reword companion text | "Do you think they are more confused than usual for them, or than when you arrived?" | C (strong), P (weak) | SQiD wording compares with the usual self; companion may not know the staff-check time | SQiD; 4AT |
| CEDIS 105 → `head_injury` | Review | Clinical team to decide; candidate spine pathway | — | Neck trauma red flags are spinal, not headache/vomiting | CEDIS |
| CEDIS 801/802 exclusion | Review | Confirm against the site's CEDIS version (2024 uses "Multi-system trauma") | — | Name change in 2024 list | CEDIS 2024 |
| CEDIS 410 display | Optional | Source spelling "parasthesias" | — | Cosmetic | CEDIS |
| SOURCES.md `aas_guideline` | Correct citation | "Ohle et al., CMAJ 2020;192:E832" | — | Wrong journal/year in the request; the repo row has no year, so add it | AAS |

**Proposed new items, with evidence strength**

| New item / option | Where | Draft wording | Reporter | Evidence strength |
|---|---|---|---|---|
| `severe_breathless` (new_findings) | Universal | "So breathless I can't finish a sentence, or gasping" | P, C | Moderate: NHS public guidance; strong face validity |
| `skin_colour` (new_findings) | Universal | "Lips or skin turning blue, grey, very pale or blotchy" | C (strong), P | Moderate: NHS breathlessness and UK Sepsis Trust; not validated as self-report |
| `swelling_face_throat` (new_findings) | Universal | "Swelling of lips, tongue, face or throat, or trouble swallowing" | P, C | Moderate: Food Allergy Canada (snippet); strong face validity |
| `seizure` (new_findings) | Universal | "Had a seizure (fit)" | C (strong), P | Moderate: NHS headache/head-injury 999 lists |
| `blood_cough_vomit` (new_findings) | Universal | "Coughing up or vomiting blood" | P, C | Moderate: MyHealth Alberta PE, CEDIS 259/655 |
| `shivering` (new_findings) | Universal | "Shaking or shivering that won't stop" | P, C | Low–moderate: UK Sepsis Trust awareness list; non-specific |
| `doom` (new_findings) | Universal (review-level) | "Feel like something terrible is happening, or like I might die" | P only | Low: Sepsis Trust and PHAC "sense of dread"; low specificity |
| `sweaty_pale` (new_findings or chest) | Chest/back or universal | "Sweaty, clammy or very pale" | C (strong), P | Moderate: PHAC heart attack signs |
| `pain_character` | Chest/back | "Does the pain feel tearing or ripping, or like the worst pain you've ever had?" | P→C | Low–moderate: AAS high-risk features, expert consensus only |
| `limb_cold_numb` | Chest/back (and universal?) | "Has an arm or leg suddenly gone cold, pale, numb or weak?" | P, C | Moderate: AAS limb perfusion deficit; CEDIS 011 |
| `leg_swelling` | Chest/back | "New swelling or pain in one leg or calf" | P, C | Moderate: Thrombosis Canada/Providence clot symptoms |
| `fluid_nose_ears` | Head injury | "Clear watery fluid or blood coming from the nose or ears" | P, C | Moderate: NHS-HI 999; CCHR basal skull fracture sign (staff confirm) |
| `behaviour_change` | Head injury, confused | Companion: "Acting differently from usual (more irritable, agitated, distracted or withdrawn)" | C only | Moderate: NHS-HI behaviour change; 4AT acute-change construct |
| `dizziness` option | Neuro group | "New dizziness or the room spinning" | P→C | Moderate for the importance of the stroke miss (AHRQ); low specificity |
| CEDIS 008 Syncope map | cedis-groups | Map to `chest_back_pain` or flag | — | Low–moderate: syncope defines the AAS population; clinical decision |

**Licence notes**
- Do not reproduce FAST: H&S licence is non-commercial, no modification, campaign-only.
- Verify the BE-FAST licence before using the acronym.
- UK Sepsis Trust content is © with no reuse terms: paraphrase only, as above.
- CTAS materials need CAEP permission.
- The Canadian CT Head Rule and Ottawa SAH rule are cited only, not reproduced.

### Gaps
- NICE NG232 primary text unverified (403).
- Heart & Stroke "other signs" page, Sepsis Canada, the CTAS 2025 text and CAEP 2026 text not retrieved.
- No lay-source evidence for abdominal-pain red flags.
- None of the proposed items has been validated as a phone self-report trigger in an ED waiting room. Alert burden from added universal options is unknown and should be measured in the pilot (brief §2 eTriage overtriage data).
