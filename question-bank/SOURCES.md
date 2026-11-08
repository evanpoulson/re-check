# Question bank sources

Each item in `questionnaire.json` names its evidence with `urn:recheck:fhir:evidence`. Each key in the table is one of these values. Recheck wrote all the wording. Nothing comes from a licensed instrument.

**Status.** This is demo content for synthetic visits. It does not have clinical approval. Before any real use, the clinical team of the site must review the wording, groups, options and thresholds.

## Evidence keys

| Key | Source | Used for | Reuse |
| --- | --- | --- | --- |
| `pwq` | Albutt et al., Patient Wellness Questionnaire, *J Patient Saf* 2021 ([PMC8612917](https://pmc.ncbi.nlm.nih.gov/articles/PMC8612917)) | `feeling_now`, `feeling_change`: two 5-point questions, adapted to "since staff last checked" | Published research items. Wording adapted and cited. The study is small and from one oncology ward, so the evidence is preliminary. |
| `marthas_rule` | NHS England, Martha's Rule core standards ([page](https://www.england.nhs.uk/long-read/marthas-rule-core-standards/)). Trust versions, for example [Royal Marsden](https://www.royalmarsden.nhs.uk/your-care/inpatient-care/marthas-rule) and [East Lancashire](https://elht.nhs.uk/services/call-concern/call-concern-patient-wellness-questionnaire) | Wellness questions, "I'm worried" and "I need help now" escalation | Public programme. The core standards page did not load on 2026-11-07. Compare the wording with that page. |
| `marthas_rule_calls` | NHS England, [Martha's Rule call data, March 2026](https://www.england.nhs.uk/2026/03/over-10000-calls-to-marthas-rule-in-first-16-months-to-trigger-urgent-review-of-care/) | `desk_question`: approximately 31% of calls were about acute deterioration, so non-clinical questions need a separate route | Public data |
| `ahs_hcs_181_01` | AHS, ED assessment and reassessment guideline HCS-181-01 ([PDF](https://publicshare.albertahealthservices.ca/teams/policydocuments/1/clp-ed-assess-reassess-pts-guideline-hcs-181-01.pdf)) | `pain`, CTAS-based check-in intervals | Public guideline. It lists clinical elements, not question wording. |
| `brief_s4` | `docs/research/recheck-waiting-room.md`, section 4 | Follow-up prompts for each pathway | Recheck |
| `ahrq_misdiagnosis` | AHRQ, *Diagnostic Errors in the Emergency Department* ([NBK588123](https://www.ncbi.nlm.nih.gov/books/NBK588123/)) | Universal warning signs. Dizziness in the neuro group. | Public report |
| `tia_bystander` | Unawareness of TIA symptoms witnessed by bystanders, multicentre cohort ([PubMed 32961590](https://pubmed.ncbi.nlm.nih.gov/32961590/)) | Companion wording. Reassuring patient answers do not clear a concern. | Cited only |
| `aas_guideline` | Canadian acute aortic syndrome guideline ([PMC7828987](https://pmc.ncbi.nlm.nih.gov/articles/PMC7828987/)) | Chest and back follow-ups: pain that moves, sudden worsening | Cited only |
| `aas_misdiagnosis` | Misdiagnosis of aortic dissection, systematic review ([PubMed 34968970](https://pubmed.ncbi.nlm.nih.gov/34968970/)) | Why "about the same" can miss a pain that moves | Cited only |
| `csbp_ed` | Canadian Stroke Best Practices, ED evaluation ([page](https://www.strokebestpractices.ca/recommendations/acute-stroke-management/emergency-department-evaluation-and-management)) | `last_known_well` | Cited only. The Heart & Stroke FAST mnemonic has a licence for non-commercial use without changes, so the bank does not copy it. |
| `nice_ng232` | NICE NG232, head injury ([recommendations](https://www.nice.org.uk/guidance/ng232/chapter/recommendations)) | Head-injury follow-ups: drowsiness, vomiting, headache, seizure | Cited only. The bank does not copy CRT6 or SCAT6. |
| `delapp` | Tieges et al., smartphone DelApp counting task ([2015 study](https://core.ac.uk/download/288348629.pdf), [Usher Institute](https://usher.ed.ac.uk/edinburgh-clinical-trials/our-studies/completed-studies/delapp)) | `circle_count` design idea | Licence unknown. The Recheck design is independent and cited. Nobody has validated it for self-use. |
| `edtb` | Edinburgh Delirium Test Box, the device that DelApp comes from | `circle_count` design idea | Cited only |

## Complaint groups

`cedis-groups.json` maps CEDIS presenting complaint codes to a complaint group. It also lists the complaints where the app is not offered. The codes and names come from the CEDIS Presenting Complaint List v1.1 (Grafstein et al., *CJEM* 2008, [doi:10.1017/S1481803500009878](https://doi.org/10.1017/S1481803500009878)). The current list is free from [CIHI](https://secure.cihi.ca/estore/productSeries.htm?pc=PCC515). Compare the codes with the version that the site uses. CTAS modifiers and acuity tables are CAEP material, and the bank does not copy them.

## Not used

- **NHS Pathways.** Licensed, closed content and a regulated medical device. The bank uses only its design idea: urgent questions first, and each answer selects the next question.
- **Commercial triage content** (Schmitt-Thompson, Infermedica). It needs a paid licence. It is not designed for repeated checks in the waiting room.
- **4AT "months backwards".** It has validation as a spoken test that a clinician gives, not as a test on a phone. The bank uses `circle_count` instead.
