# Question bank sources

Every item in `questionnaire.json` names its evidence with `urn:recheck:fhir:evidence`. Each key below is one of those values. All wording is Recheck's own. Nothing is copied from a licensed instrument.

**Status:** demo content for synthetic visits. Not clinically approved. The site's clinical team must review the wording, groups, options and thresholds before any real use.

## Evidence keys

| Key | Source | Used for | Reuse |
| --- | --- | --- | --- |
| `pwq` | Albutt et al., Patient Wellness Questionnaire, *J Patient Saf* 2021 ([PMC8612917](https://pmc.ncbi.nlm.nih.gov/articles/PMC8612917)) | `feeling_now`, `feeling_change`: two 5-point questions, adapted to "since staff last checked" | Published research items; wording adapted, cited. Small single-centre oncology-ward study, so treat the evidence as preliminary. |
| `marthas_rule` | NHS England, Martha's Rule core standards ([page](https://www.england.nhs.uk/long-read/marthas-rule-core-standards/)); trust versions such as [Royal Marsden](https://www.royalmarsden.nhs.uk/your-care/inpatient-care/marthas-rule) and [East Lancashire](https://elht.nhs.uk/services/call-concern/call-concern-patient-wellness-questionnaire) | Wellness questions, "I'm worried" and "I need help now" escalation | Public programme. The core standards page could not be retrieved on 2026-11-07, so confirm the wording against it. |
| `marthas_rule_calls` | NHS England, [Martha's Rule call data, March 2026](https://www.england.nhs.uk/2026/03/over-10000-calls-to-marthas-rule-in-first-16-months-to-trigger-urgent-review-of-care/) | `desk_question`: about 31% of calls concerned acute deterioration, so non-clinical questions need their own route | Public data |
| `ahs_hcs_181_01` | AHS, ED assessment and reassessment guideline HCS-181-01 ([PDF](https://publicshare.albertahealthservices.ca/teams/policydocuments/1/clp-ed-assess-reassess-pts-guideline-hcs-181-01.pdf)) | `pain`, CTAS-based check-in intervals | Public guideline; lists clinical elements, not question wording |
| `brief_s4` | `docs/research/recheck-waiting-room.md`, section 4 | Follow-up prompts for each pathway | Ours |
| `ahrq_misdiagnosis` | AHRQ, *Diagnostic Errors in the Emergency Department* ([NBK588123](https://www.ncbi.nlm.nih.gov/books/NBK588123/)) | Universal warning signs; dizziness in the neuro group | Public report |
| `tia_bystander` | Unawareness of TIA symptoms witnessed by bystanders, multicentre cohort ([PubMed 32961590](https://pubmed.ncbi.nlm.nih.gov/32961590/)) | Companion wording; reassuring patient answers don't clear a concern | Cited only |
| `aas_guideline` | Canadian acute aortic syndrome guideline ([PMC7828987](https://pmc.ncbi.nlm.nih.gov/articles/PMC7828987/)) | Chest/back follow-ups: pain moving, sudden worsening | Cited only |
| `aas_misdiagnosis` | Misdiagnosis of aortic dissection, systematic review ([PubMed 34968970](https://pubmed.ncbi.nlm.nih.gov/34968970/)) | Why "about the same" can miss a moving pain | Cited only |
| `csbp_ed` | Canadian Stroke Best Practices, ED evaluation ([page](https://www.strokebestpractices.ca/recommendations/acute-stroke-management/emergency-department-evaluation-and-management)) | `last_known_well` | Cited only. Heart & Stroke's FAST mnemonic is licensed for non-commercial use without modification, so it is not reproduced. |
| `nice_ng232` | NICE NG232, head injury ([recommendations](https://www.nice.org.uk/guidance/ng232/chapter/recommendations)) | Head-injury follow-ups: drowsiness, vomiting, headache, seizure | Cited only. CRT6 and SCAT6 are not reproduced. |
| `delapp` | Tieges et al., smartphone DelApp counting task ([2015 study](https://core.ac.uk/download/288348629.pdf); [Usher Institute](https://usher.ed.ac.uk/edinburgh-clinical-trials/our-studies/completed-studies/delapp)) | `circle_count` design idea | Licence unknown. Ours is an independent design, cited and unvalidated for self-use. |
| `edtb` | Edinburgh Delirium Test Box, the device DelApp is based on | `circle_count` design idea | Cited only |

## Complaint groups

`cedis-groups.json` maps CEDIS presenting complaint codes to a complaint group and lists the complaints where the app is not offered. Codes and names come from the CEDIS Presenting Complaint List v1.1 (Grafstein et al., *CJEM* 2008, [doi:10.1017/S1481803500009878](https://doi.org/10.1017/S1481803500009878)). The current list is free from [CIHI](https://secure.cihi.ca/estore/productSeries.htm?pc=PCC515). Confirm codes against the site's version. CTAS modifiers and acuity tables are CAEP material and are not reproduced.

## Not used

- **NHS Pathways:** licensed, closed content and a regulated medical device. Only its design idea is used: urgent questions first, with each answer choosing the next question.
- **Commercial triage content** (Schmitt-Thompson, Infermedica): needs a paid licence and isn't built for repeated waiting-room checks.
- **4AT "months backwards":** validated as a spoken clinician test, not a self-tapped one. `circle_count` is used instead.
