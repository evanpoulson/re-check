# Alberta and AHS context for the Recheck patient screen (Foothills ED, Calgary)

Research date: November 7, 2026. Scope: adult ED waiting room, Calgary/Alberta. "Fetched" means I read the primary page or PDF this session. "Snippet" means I saw it only in search results and did not open the page. Repo files read: `docs/research/recheck-waiting-room.md` §§1, 2, 6; `docs/recheck-project-plan.md`; `web/src/i18n/en.json` (patient, urgent, sent, desk, leaving, message, privacy); `api/src/recheck/wait_times/{ahs.py,estimate.py}`.

## Q1. AHS HCS-181-01 (ED assessment and reassessment guideline): intervals, response to change, instructions to waiting patients, version

### Takeaway
The repo brief is accurate. The guideline in force is still the October 12, 2023 revision. It says waiting patients must be told to "immediately return to the triage desk" if they feel worse and to "alert a health care professional" before leaving. Its scheduled review date (October 12, 2026) has passed, and I found no newer version. Staff respond to a change with more frequent reassessment, repeat vital signs for a marked change, and notify the physician or nurse practitioner (NP). Care priority can change, but the initial CTAS stays on record.

### Cited Findings
- Document header (fetched November 7, 2026): HCS-181-01, *Assessment and Reassessment of Patients*. Provincial scope covering EDs and urgent care centres. Initial effective date June 20, 2016. **Revision effective date October 12, 2023. Scheduled review date October 12, 2026.** Sponsor: Emergency Strategic Clinical Network. It states that "Only the electronic version of this document, as hosted on the Policy Services website or www.ahs.ca, is valid." — [AHS HCS-181-01 PDF](https://publicshare.albertahealthservices.ca/teams/policydocuments/1/clp-ed-assess-reassess-pts-guideline-hcs-181-01.pdf)
- §1.3, verbatim: "For all patients being referred to the ED or UCC waiting room, the health care professional working in the triage area shall inform all patients to: a) immediately return to the triage desk if they feel their condition is worsening; and b) alert a health care professional if they choose to leave prior to the Physician or NP initial assessment." — [HCS-181-01 §1.3](https://publicshare.albertahealthservices.ca/teams/policydocuments/1/clp-ed-assess-reassess-pts-guideline-hcs-181-01.pdf)
- §2.1: The health care professional is responsible for post-triage reassessments and vital signs "on all patients awaiting initial Physician or NP assessment", based on clinical judgement and Appendix A. §2.2: for "a marked change in the patient's condition, a complete set of vital signs shall be repeated and documented". §2.2a: "Priority for care may be adjusted with acuity change, however the initial CTAS score does not change." — [HCS-181-01 §2](https://publicshare.albertahealthservices.ca/teams/policydocuments/1/clp-ed-assess-reassess-pts-guideline-hcs-181-01.pdf)
- §4.1a: more frequent reassessment is required "(i) as indicated by clinical judgment; (ii) vital signs are not within expected limits…; (iii) after any intervention…; and/or (iv) any change in patient condition". §3.5 and §4.3: "notify the Physician or NP as soon as possible if the patient's clinical condition significantly changes." — [HCS-181-01 §§3.5, 4](https://publicshare.albertahealthservices.ca/teams/policydocuments/1/clp-ed-assess-reassess-pts-guideline-hcs-181-01.pdf)
- Appendix A, Table 1 (reassessment "with/without vital signs", with an asterisk citing the CTAS guidelines): CTAS 1 ongoing. CTAS 2 "every 15*–60 minutes", and if no treatment space is available, "all CTAS Level 2 patients shall be located within visual range of the triaging health care professional at all times". CTAS 3 "every 30*–120 minutes". CTAS 4 "every 60*–120 minutes". CTAS 5 "every 120* minutes". Every level adds "or more frequently based on clinical judgment". — [HCS-181-01 Appendix A](https://publicshare.albertahealthservices.ca/teams/policydocuments/1/clp-ed-assess-reassess-pts-guideline-hcs-181-01.pdf)
- §8.1: staff document reassessments and the "communication of any abnormal findings to the Physician or NP". The definitions include "Family(-ies)" and "Designated support person(s)", meaning individuals the patient identifies as support, which covers friends and informal caregivers. — [HCS-181-01 §8 and Definitions](https://publicshare.albertahealthservices.ca/teams/policydocuments/1/clp-ed-assess-reassess-pts-guideline-hcs-181-01.pdf)
- The guideline does not mention interpreters, communicating wait times, or a procedure for patients who leave without being seen. Beyond §1.3b, it has no left-without-being-seen (LWBS) procedure. — same PDF (full text read)

### Inferences
- The instruction to "return to the triage desk" is the AHS baseline instruction for a patient who feels worse. Recheck's "I need help now" path should repeat it. It should not replace it with "wait for the app".
- §2.2a lets staff adjust care priority, though not CTAS, after a change. So a promise that "answers never change your place in line" is literally true of the app's ranking but could mislead patients (see Audit).
- §1.3b says "alert a health care professional", not "tap a button". The "I'm leaving" button supplements telling a person and does not replace it.
- The patient-prompt cadence and the staff reassessment deadline must stay independent. Appendix A is a staff obligation. A patient answering a check-in is not a reassessment.

### Gaps
- The scheduled review date (October 12, 2026) has passed. The policy URL still served the 2023 revision on November 7, 2026, and I found no newer version. Confirm with AHS Policy Services (policy@ahs.ca), and ask whether the 2025 national CTAS revision changes Appendix A.
- I could not see Foothills-specific site procedures or the wording triage nurses use for the §1.3 instruction.

## Q2. AHS and MyHealth Alberta patient-facing ED information, the Foothills ED page, leaving without being seen, Health Link 811, MyAHS Connect

### Takeaway
Patient-facing AHS material consistently says three things. The sickest people are seen first. If your condition changes while waiting, tell the triage nurse. AHS "can't predict how long you will need to wait". I found no public AHS waiting-room poster or pamphlet with "If you feel worse…" or "Before you leave…" wording. The only "tell staff before leaving" source is HCS-181-01 §1.3b. MyAHS Connect is explicitly "not intended for urgent matters". AHS offers 811 for 24/7 health advice.

### Cited Findings
- MyHealth Alberta "What to Expect in the Emergency Room (ER)" (adaptation date April 15, 2026, fetched): "the most serious problems are treated first". "People who are more seriously ill are treated first." "If you feel that your condition has changed while you are waiting, tell the nurse who decides on order of treatment (triage)." Once in care: "If your condition changes, let your doctor or nurse know right away." The page does not cover leaving before being seen, 911 or 811. — [MyHealth Alberta ER what to expect](https://myhealth.alberta.ca/Health/aftercareinformation/pages/conditions.aspx?hwid=acv4152)
- Foothills Medical Centre Emergency Services page on AHS Find Health (fetched, no update date): EDs "take care of people that are very sick or injured on a priority basis. This means the sickest people are seen first." "If you go to an emergency department for care that isn't urgent, you will not likely be seen right away." "**We can't predict how long you will need to wait in the emergency department.**" Patients are triaged using CTAS. The page lists "Interpreter/Translation services" under Service Languages. Address: 1403 29 Street NW. It has no content on leaving and no Patient Relations content. — [AHS Find Health: Foothills Emergency](https://www.albertahealthservices.ca/findhealth/Service.aspx?id=6915&serviceAtFacilityID=1075657)
- (Snippet) AHS urgent care page: "Alert the nurse if your condition gets worse while you are in the waiting room." The Stollery ED page (paediatric, outside Recheck's scope) gives the equivalent instruction for a child. — [AHS urgent care page](https://www.albertahealthservices.ca/eehc/Page16093.aspx); [Stollery ED](https://www.albertahealthservices.ca/stollery/page14037.aspx)
- AHS wait-times page (fetched): "Anyone needing emergency care is reminded to call 911, or to go to the nearest emergency department or urgent care centre." "For health advice 24/7 phone 811 a free health information service." — [AHS ED wait times](https://www.albertahealthservices.ca/waittimes/waittimes.aspx)
- (Snippet) MyAHS Connect is not intended for urgent matters or for use in emergencies. Users are told to call their provider, go to the nearest ER, and/or call 911. The portal shows test results, health summaries, medications, appointments and secure messaging. Most results post automatically, some after a delay, and patients cannot stop results being sent to their account. — [MyAHS Connect features (AHS)](https://www.Ahs.Ca/assets/info/cis/if-cis-cc-mac-features.pdf); [Viewing test results online (AHS)](https://www.albertahealthservices.ca/assets/info/cis/if-cis-cc-viewing-test-results-online.pdf)
- (Snippet, secondary source) MyAHS Connect is reportedly being renamed "MyChart". — [Western Standard](https://www.westernstandard.news/news/alberta-rebrands-online-health-records-system-as-mychart/67419)

### Inferences
- The patient screen should use AHS's own framing: "The sickest people are seen first", "tell the triage nurse", and an AHS estimate "can't predict" an individual wait. Matching AHS language lowers the risk of contradicting what triage staff and MyHealth Alberta already tell patients.
- For an ED waiting room, 911 is the wrong instruction ("go to triage" is right). Once someone leaves, though, AHS's generic advice is "call 911 or go to the nearest ED" for emergencies and "811" for advice. Those belong on the leaving confirmation screen.
- Recheck answers will not appear in MyAHS Connect in the prototype. The privacy panel should not imply that they are part of the patient's chart.

### Gaps
- I found no public AHS waiting-room poster or pamphlet text. Foothills may have local signage. Ask the site for photos.
- I found no AHS patient-facing LWBS guidance (for example "you may need to be re-triaged if you come back"). Do not invent any.
- I did not confirm whether ED visit notes or wait events from Connect Care appear in MyAHS Connect.

## Q3. AHS ED wait-time estimate: definition, wording, update frequency, and whether Recheck's wording matches

### Takeaway
AHS defines the posted number as an estimate of time **from triage-nurse assessment to being seen by a physician**. It is a snapshot, does not apply to more seriously ill patients, and is not total time in hospital. Recheck's "current estimate for new arrivals" does not match. The estimate is measured from triage, applies to less urgent patients, and is not "your" wait. AHS recalculates every 2 minutes, while Recheck polls every 5 minutes.

### Cited Findings
- AHS wait-times page (fetched November 7, 2026), verbatim fragments: "The wait times posted reflect an estimate of how long it might take from an assessment by a triage nurse to being seen by a physician." "Wait times do not represent the total time patients may spend at the hospital." "The estimated wait time is approximate, and patients may be seen faster than the wait time indicates." "The estimated wait times do not apply to critically ill or injured patients – they will always be seen quickly." "The estimated time represents a prediction of a very specific snapshot in time and does not apply to more seriously injured or ill patients." — [AHS ED wait times](https://www.albertahealthservices.ca/waittimes/waittimes.aspx)
- Method, verbatim fragments: "The times are calculated through a software system, which uses current data from the facility." "…the estimated wait time can fluctuate significantly at any time, on any given day." "Algorithm is generally based on a physician seeing a patient every 30 minutes." "The above calculation is done every 2 minutes as more patients are being triaged and more patients are being seen." — [AHS ED wait times](https://www.albertahealthservices.ca/waittimes/waittimes.aspx)
- The Foothills ED page separately says: "We can't predict how long you will need to wait in the emergency department." — [AHS Find Health: Foothills Emergency](https://www.albertahealthservices.ca/findhealth/Service.aspx?id=6915&serviceAtFacilityID=1075657)
- Repo code: `ahs.py` parses the undocumented JSON feed behind the page (`/Webapps/WaitTimes/api/waittimes/en`). The docstring says the page refreshes it every two minutes and that AHS terms allow "personal, non-commercial use only", so a pilot needs written AHS permission. `estimate.py` sets `POLL_INTERVAL = 5 min` and `STALE_AFTER = 15 min`, and shows nothing when AHS marks the site unavailable. `waited_minutes` counts from `triaged_at`. — repo `api/src/recheck/wait_times/ahs.py`, `estimate.py`

### Inferences
- "For new arrivals" is a Recheck gloss. AHS does not use it. The closest faithful reading is "for a less urgent patient triaged now, the estimated time to see a physician". Because Recheck's "time waited" also counts from triage, the two numbers are on the same basis, which is good. They answer different questions, though: a department-level estimate versus this person's elapsed time. Patients will subtract one from the other, so the copy should block the "you have X left" reading.
- CTAS 2 patients are "more seriously ill". AHS says the estimate does not apply to them, so consider hiding it, or adding a caveat, for CTAS 2 visits.
- Show the estimate's "as of" time and attribute it to AHS. That matches AHS's "snapshot" framing and helps when Recheck's 5-minute poll lags AHS's 2-minute recalculation.

### Gaps
- I did not see the exact on-page label text next to each facility (for example whether it reads "Estimated wait"), because the page renders it with JavaScript. Check it in a browser.
- AHS's terms of use for reusing the feed were not re-verified this session. I relied on the repo's docstring.

## Q4. Acute Care Alberta review of the Grey Nuns ED death, and the triage liaison physician programme at Foothills

### Takeaway
The January 14, 2026 Acute Care Alberta (ACA) quality assurance document lists 16 recommendations. Waiting-room staffing (rec 2), physician at triage with a designated physician lead when that role is unavailable (recs 5–6), and **rec 15, digital/AI clinical decision support "for staff"**, are the relevant ones. None addresses patient-facing communication or family escalation. The premier said on November 7, 2026 that six EDs now have triage physicians. Foothills was named as a pilot site in earlier reporting, but I could not confirm that it is operating there.

### Cited Findings
- The ACA document (fetched) is dated January 14, 2026 and titled "Delay In Accessing Emergency Care Treatment Space". Its header reads "Section 9 Protected and Confidential", yet it is publicly hosted. It describes a patient with chest pain who received care through a nurse-initiated protocol, waited about eight hours before being moved to a treatment space, then had "a critical cardiovascular event". The vulnerabilities it lists are prolonged ED waits, overcrowding and clinical decision support. The document itself names neither the patient nor the site; that linkage comes from ACA's public release and news coverage. — [ACA review PDF](https://www.acutecarealberta.ca/aca-qa-review-2026-01-14.pdf); [ACA public release](https://acutecarealberta.ca/Page48.aspx)
- Rec 1: a human factors assessment of "care spaces and waiting areas" covering "safety… and patient experience". Rec 2: 24/7 ECG technician coverage, and conversion of temporary nursing positions to permanent ones to "provide support to waiting room, hallway, and triage areas". — [ACA review PDF](https://www.acutecarealberta.ca/aca-qa-review-2026-01-14.pdf)
- Rec 5: "Implement a physician at triage/overcapacity physician model at appropriate EDs to better support triage nurses… reduce time for patients to see a physician, and reduce left-without-being-seen rates." Rec 6: when no physician at triage is available, designate "a physician lead… responsible for supporting triage/charge nurses regarding clinical concerns". Rec 9: surge triggers should account for "high acuity ED patients not yet in treatment spaces (i.e. waiting rooms…)". — [ACA review PDF](https://www.acutecarealberta.ca/aca-qa-review-2026-01-14.pdf)
- Rec 14: revise the chest pain nurse-initiated protocol so that negative testing "does not exclude other sinister causes" and to cover when to add bilateral BP. **Rec 15, verbatim: "Explore digital health/artificial intelligence solutions that could enhance/facilitate clinical decision support for staff to assist with identifying patients who may require more urgent assessment by a physician."** — [ACA review PDF](https://www.acutecarealberta.ca/aca-qa-review-2026-01-14.pdf)
- Alberta government statement, October 16, 2026 ("Strengthening emergency departments: Minister LaGrange", fetched): Triage Liaison Physicians work "directly in busy emergency department waiting areas", assess patients sooner, and identify those who "may be deteriorating". It names no sites and says nothing about patient communication. — [alberta.ca release](https://www.alberta.ca/release.cfm?xID=97966C5AB1D6F-D276-21FB-8F856C5F7965EDF3)
- Canadian Press via Global News, November 7, 2026 (fetched): the premier said six ERs have doctors on triage duty as of Saturday. It **names no sites** and gives no hours. — [Global News](https://globalnews.ca/news/12141285/albertas-hospital-triage-program-now-in-operation-danielle-smith/)
- (Snippets, earlier 2026 reporting) CBC said ACA would pilot triage liaison physicians in five urban EDs including Foothills and Peter Lougheed, starting February 1. Physicians would monitor waiting patients "for signs of deterioration". Later CBC stories reported Alberta Medical Association pay negotiations and, "4 months after province's pledge", no triage liaison physicians yet. Site counts (five vs six) and dates differ between reports. — [CBC Jan 2026](https://www.cbc.ca/news/canada/edmonton/triage-liaison-physicians-alberta-hospital-emergency-rooms-9.7049620); [CBC AMA negotiations](https://www.cbc.ca/news/canada/edmonton/triage-liaison-physicians-emergency-rooms-alberta-government-9.7069230); [CBC four months later](https://www.cbc.ca/news/canada/edmonton/edmonton-hospital-er-triage-liaison-doctors-review-deaths-9.7221063)

### Inferences
- Rec 15 supports a **staff-facing** decision-support tool. It does not mandate or describe a patient app. Recheck should present the patient screen as a way to feed staff decision support ("staff see your answers"). It should not say it tells patients whether they are urgent.
- Recs 5–6 map onto Recheck's routing to "on-duty triage liaison physician or configured backup". The patient copy should name roles generically ("a doctor", "a clinician") because coverage hours are unknown.
- Rec 5's LWBS goal supports keeping the "I'm leaving" button and routing it to staff.

### Gaps
- I could not confirm whether Foothills is one of the six sites operating on November 7, 2026, or its hours. Ask the site.
- I did not read the separate Covenant Health internal review.

## Q5. Patient and family escalation programmes in Alberta or Canada similar to Martha's Rule; Patient Relations; Alberta Health Advocates

### Takeaway
I found no Alberta or AHS family-activated rapid-response programme (Condition Help or an equivalent), and no Canadian ED waiting-room equivalent of Martha's Rule. Alberta's formal routes are AHS Patient Relations (1-855-550-2555), escalation to the Patient Concerns Officer, the Office of the Alberta Health Advocates, and the Alberta Ombudsman. These handle complaints after the fact. They are not real-time clinical escalation.

### Cited Findings
- (Snippets) "Condition Help" is a family-activated rapid response team, mostly described in US hospitals. Families can activate it when concerns raised with the nurse, charge nurse or physician feel unaddressed. A qualitative systematic review found 6 articles (5 interventions) on paediatric family-activated rapid response. — [AHRQ PSNet: Condition Help implementation](https://psnet.ahrq.gov/issue/implementation-condition-help-family-teaching-and-evaluation-family-understanding); [AHRQ PSNet: paediatric family-activated RRT review](https://psnet.ahrq.gov/issue/paediatric-family-activated-rapid-response-interventions-qualitative-systematic-review)
- (Snippets) AHS Patient Relations takes concerns online or at **1-855-550-2555** (toll-free in Alberta). A Patient Concerns Consultant reviews a concern first, and a patient who is still dissatisfied can ask for a Patient Concerns Officer review through the same number. — [AHS Patient Concerns & Feedback](https://albertahealthservices.ca/about/patientfeedback.aspx); [AHS concerns resolution FAQ](https://www.albertahealthservices.ca/assets/info/pf/if-pf-pc-concern-resolution-faq.pdf)
- (Snippets) The Office of the Alberta Health Advocates (Health Advocate and Mental Health Patient Advocate) is separate from AHS and helps people navigate the system. The Alberta Ombudsman can review the AHS concerns process. — [Alberta.ca resolve health care concerns](https://www.alberta.ca/resolve-health-care-service-concerns-in-the-health-system.aspx); [Alberta Ombudsman](https://www.ombudsman.ab.ca/?p=6625)
- HCS-181-01 recognises "family" and "designated support person(s)" chosen by the patient, which supports a companion role. — [HCS-181-01 Definitions](https://publicshare.albertahealthservices.ca/teams/policydocuments/1/clp-ed-assess-reassess-pts-guideline-hcs-181-01.pdf)

### Inferences
- In Alberta, Recheck's companion "I'm worried they're getting worse" route would be new. No local policy text promises patients that "a doctor will review your concern within X minutes", so the copy should avoid timed promises.
- The "Question about my wait or care" button could add one line pointing to Patient Relations for concerns about care quality, which is a different thing from clinical worry. Keep that line secondary so it does not divert urgent reports.

### Gaps
- I may have missed a Canadian hospital (for example in Ontario or BC) running a patient- or family-activated rapid response. My searches did not surface one. The Alberta Health Advocates' phone number was not verified.

## Q6. Calgary languages and AHS interpretation; whether English + Punjabi + Tagalog is defensible

### Takeaway
Yes, as a first set. Statistics Canada lists Punjabi as Calgary CMA's most common non-official home language in 2021, and Calgary reporting puts Punjabi and Tagalog as the top two, followed by Mandarin, Cantonese, Spanish, Arabic and Urdu. Chinese (Mandarin/Cantonese, with simplified or traditional script) is the obvious next addition. AHS provides interpretation on request by phone and video, and offers printable language cards.

### Cited Findings
- Statistics Canada (2021 Census, *Increasing diversity of languages… spoken at home*): Punjabi is the most common non-official language spoken at home in Calgary CMA (Edmonton is also Punjabi, Winnipeg Tagalog). — [StatCan 11-627-M 2022051](https://www150.statcan.gc.ca/n1/pub/11-627-m/11-627-m2022051-eng.htm)
- (Snippet; fetch blocked with 403) CBC Calgary, 2021 census coverage: Punjabi and Tagalog "remain Calgary's top two most spoken languages" aside from English, followed by Mandarin, Cantonese, Spanish, Arabic and Urdu. It does not say whether this counts mother tongue or home language. — [CBC Calgary](https://www.cbc.ca/news/canada/calgary/calgary-multicultural-news-language-census-1.6555890)
- (Snippet; 2016, older) The City of Calgary profile gives the top non-official mother tongues as Tagalog, Punjabi, Cantonese, Mandarin and Spanish. — [City of Calgary language profile (2016 data)](https://www.calgary.ca/CSPS/CNS/Documents/Social-research-policy-and-resources/calgary-profile-chapter-3-language.pdf)
- AHS languages page (fetched): "Print off and take a language card with you to your healthcare facility so you can request an interpreter to assist you." It lists 16 languages for translated resources. — [AHS Languages](https://www.albertahealthservices.ca/languages/languages.aspx)
- (Snippets) AHS interpretation is offered "by telephone, through live video or for unique circumstances in-person". Patients, families and staff identify the need and the language or dialect, and immediate needs go through a designated toll-free number. Interpretation is also available in 23 Indigenous languages. One report (date unclear) cites 1.2 million minutes of phone interpretation in 81 languages in a year. — [AHS interpretation request form](https://www.albertahealthservices.ca/frm-21390.pdf); [AHS Indigenous languages news](https://www.albertahealthservices.ca/news/Page17422.aspx); [Daily Hive](https://dailyhive.com/calgary/health-information-alberta-health-services-languages)

### Inferences
- English, Punjabi and Tagalog cover the two largest non-official language groups in Calgary. Many Tagalog speakers also read English well, so Chinese may serve more people with limited English. That is a hypothesis; the census measure that would test it ("knowledge of neither official language") was not retrieved.
- The copy should say "Ask any staff member for an interpreter". It should not promise that interpretation is free or instant, because neither was verified.
- Foothills' catchment (NW Calgary) may differ from the citywide mix. Prioritise using language data from the site's own interpreter requests.

### Gaps
- I could not retrieve exact 2021 Calgary counts by mother tongue or home language, or the count with knowledge of neither official language; the StatCan census profile returned 403. I could not verify that AHS interpretation is free to patients, though that is widely assumed. I found no Foothills ED interpreter workflow.

## Q7. Privacy (Health Information Act) and plain-language expectations for a patient app

### Takeaway
Under Alberta's Health Information Act (HIA), the custodian (AHS) remains responsible for any vendor acting as its information manager. A privacy impact assessment must be submitted to the Office of the Information and Privacy Commissioner (OIPC) before a new system goes live. Custodians must give notice of their privacy practices. June 2026 amendments let information managers submit security policies to the OIPC. I found no published AHS reading-level standard. Common health-literacy guidance targets grade 6–8.

### Cited Findings
- (Snippet) A custodian must protect confidentiality and provide notice of its privacy practices that identifies the purposes of collection. Custodians must have a written agreement with any information manager, and the custodian "continues to be responsible for compliance" for information provided to the information manager. — [Alberta Medical Association privacy roles policy](https://albertadoctors.org/media/sx3nqjzt/privacy-roles-and-responsibilities-policy.pdf)
- IAPP (August 21, 2026, fetched; full analysis paywalled): HIA amendments from a November 2025 omnibus bill came into force in June 2026. Custodians must still complete a PIA and submit it to the OIPC before implementing a new or changed system involving identifying health information. Information managers (for example AI scribes, EMRs, virtual care vendors) can now submit their security policies to the OIPC for review. — [IAPP](https://iapp.org/news/a/pias-shared-custody-ai-highlight-changes-to-albertas-health-information-act); [OIPC PIAs](https://oipc.ab.ca/privacy-impact-assessments/)
- (Snippet) Custodians must notify the Commissioner, the Minister and the affected individual of breaches that present a risk of harm "as soon as practicable". — [IAPP breach notification](https://www.iapp.org/news/a/new-mandatory-breach-notification-for-health-information-in-alberta)
- (Snippet) Health-literacy reviews report that organisations recommend patient materials at no higher than grade 6–8. — [PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC3049622)

### Inferences
- The current "What we store" panel is a good start for a synthetic demo. A pilot notice would also need: who holds the information (AHS as custodian), why it is collected, who sees it (ED staff), how long it is kept, that it is not added to MyAHS Connect (if true), and a contact for questions. I believe HIA s.22(3) requires purpose, legal authority and a contact when collecting from an individual, but I did not verify that text this session.
- "We never store your name or health number" is defensible only while the visit is synthetic and pseudonymous. A real pilot linked to a Connect Care encounter would hold identifying health information (CTAS, complaint and timestamps tied to an encounter), so "never" would become misleading.
- Aim for about grade 6 English. Current strings are short and mostly plain. "Clinician" and "triage" are the hardest words. "Triage" is used by AHS itself and appears on signage, so keep it.

### Gaps
- I did not read the HIA statute text (s.22 notice, s.60 safeguards) directly. I found no AHS-specific plain-language or patient-education standard, and no AHS standard for patient-facing digital tools.

## Audit of current patient copy (en.json) and behaviour

Abbreviations: **HCS** = HCS-181-01 (2023); **WT** = AHS wait-times page; **FMC** = AHS Foothills ED page; **MHA** = MyHealth Alberta ER page; **ACA** = ACA January 14, 2026 review.

| Key / behaviour | Current | Verdict | Suggested wording / action | Source |
|---|---|---|---|---|
| `patient.departmentWait` | "The department's current estimate for new arrivals is about {{estimate}}." | **Change** | "AHS estimate right now: about {{estimate}} from triage to seeing a doctor, for less urgent patients. It is not your personal wait." Optionally add "Updated {{time}}". Consider hiding it for CTAS 2. | WT ("from an assessment by a triage nurse to being seen by a physician"; "does not apply to more seriously… ill patients"; "snapshot in time") |
| `patient.waitUnavailable` | "Estimate unavailable." | **Keep**, with optional tweak | "AHS wait estimate not available right now." | WT; FMC ("We can't predict how long you will need to wait") |
| `patient.waited` | "You've been waiting {{waited}}." | **Keep**, with optional tweak | "You've waited {{waited}} since triage." The code counts from `triaged_at`, the same basis as the AHS estimate. | `estimate.py`; WT |
| `patient.placeInLine` | "Your answers never change your place in line." | **Change** | "The sickest people are seen first. Staff decide the order of care, not this app." This avoids promising that the order will not change: under HCS §2.2a, staff may adjust care priority after a change. | HCS §2.2a; FMC; MHA |
| (add) order-of-care line | none | **Add** | "Sickest people are seen first. Staff decide who goes next." (can merge with the row above) | FMC; MHA |
| `patient.title` / `titleCompanion` | "You are checked in" / "You are helping with a check-in" | **Keep** | Companion use fits HCS's "family"/"designated support person". | HCS Definitions |
| `patient.languageNotice` | "Questions are shown in English for now. Ask a staff member if you need help in another language." | **Change** (minor) | "Questions are in English for now. Ask any staff member for an interpreter." Do not say "free" (unverified). | AHS Languages; AHS interpretation form |
| `patient.reportChange` / "I'm worried I'm getting worse" | button | **Keep**, and add a line on the result screen | After sending: "If you feel worse, go to the triage desk now. Don't wait for a reply." | HCS §1.3a; MHA |
| `urgent.title` / `urgent.body` | "Tell a staff member now" / "Go to the nearest staff member or call out for help." | **Change** (minor) | Body: "Go to the triage desk or the nearest staff member now. Call out if you can't walk." This names the triage desk, as AHS does. | HCS §1.3a; MHA |
| `urgent.sent` / `queued` / `failed` / `retry` | received / saved / not sent | **Keep**. Add to `queued`: "Tell a staff member now. Don't wait for it to send." | — | HCS §1.3a (in-person route is the baseline) |
| `sent.stillChecking` | "Staff will still check on you on their own schedule." | **Keep** | Matches HCS §2.1 / Appendix A (staff reassessment independent of patient answers). | HCS §2.1, App. A |
| `message.clinician_will_check` / `clinician_told` | "A clinician will check on you." / "A clinician has been told." | **Keep**, no timing | Do not add a time promise. Consider "a doctor or nurse" in place of "clinician" (plainer). Coverage of a physician at triage is unconfirmed. | ACA recs 5–6; Global News November 7, 2026 |
| `desk.title` / `desk.body` | "Your question went to the triage nurse" / "The triage nurse will come to you. You do not need to do anything else." | **Change** | Body: "The triage nurse will get your question. If no one has come and you're still waiting, ask at the triage desk." This drops "will come to you", which is unverifiable under load, and "nothing else", which conflicts with HCS §1.3a if the patient gets worse. | HCS §1.3a |
| `desk.notClinical` | "If you feel worse or are worried about your health, press \"I need help now\" instead." | **Keep**, with tweak | "…press 'I need help now' or go to the triage desk." | HCS §1.3a |
| (add) concerns about care | none | **Add** (secondary, on the "Question about my wait or care" screen) | "To share a concern about your care later, call AHS Patient Relations at 1-855-550-2555." | AHS Patient Relations |
| `leaving.info` / `message.leaving_info` | "Please tell a staff member before you go. If you feel worse, return to triage right away." | **Keep** | Closely mirrors HCS §1.3a–b. Pressing the button supplements telling a person and does not replace it (§1.3b "alert a health care professional"). | HCS §1.3 |
| (add) after leaving confirmed | none | **Add** | "If you get worse after leaving, call 911 or go to the nearest emergency department. For health advice 24/7, call 811 (Health Link)." | WT (911/811 wording) |
| `privacy.stored1–3` | answers + times; triage level + complaint group; staff actions | **Keep** (demo) | For a pilot, add: who holds it (AHS), who sees it (ED staff), how long it is kept, "not added to MyAHS Connect" (if true), and a contact for privacy questions. | HIA (custodian notice of purpose); OIPC PIA requirement |
| `privacy.notStored` | "We never store your name or health number." | **Keep for demo only**; change for a pilot | Pilot: "This app does not ask for your name or health number." ("never store" becomes false once linked to a Connect Care encounter.) | HIA custodian/IM framework; IAPP 2026 |
| `privacy.synthetic` | "This demo uses synthetic data only." | **Keep** | — | — |
| Wait poller behaviour | 5-min poll; 15-min stale cutoff; hides estimate when AHS marks it unavailable | **Keep**, with optional change | AHS recalculates every 2 minutes, so polling every 2–5 minutes is fine. Show "as of" time. A pilot needs written AHS permission to reuse the feed (non-commercial terms per repo docstring). | WT; `ahs.py` docstring |
| Language set (en, pa, tl) | contract supports three codes | **Keep**; add Chinese next | Punjabi and Tagalog are Calgary's top two non-official languages. Chinese (Mandarin/Cantonese) and Spanish follow. | StatCan 2021; CBC Calgary |
| Reading level | short strings | **Keep**; target about grade 6 | Replace "clinician" with "doctor or nurse"; keep "triage" (used by AHS). | PMC readability review; MHA/FMC wording |
