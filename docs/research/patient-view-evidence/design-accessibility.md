# Accessible, health-literate design for Recheck's patient phone screens

Scope: presentation, wording style, accessibility and flow for the patient and companion screens (QR exchange, home, one-question-per-screen check-in, "Report a change", urgent screen, bottom help dock, wait text, "What we store", language picker). Clinical question content is out of scope. Sources were checked on 2026-11-07. Recheck code was read from `web/src/i18n/en.json`, `web/src/features/patient/*.tsx`, `web/src/components/{HelpBar,CircleCheck,AnswerButton,PrivacyPanel,CountdownChip}.tsx`, `web/src/index.css`, plus 390 px screenshots (home, report-a-change, urgent, help-now, exchange, check-in Q1).

## Plain language and health literacy: reading level, measurable checks, jargon, teach-back substitutes

### Takeaway
Aim for grade 6 or lower (reading age 9–11) on every patient string, with sentences of 20 words or fewer. Readability formulas only catch long words and long sentences. They miss jargon, so check terms by hand as well. Recheck's strings already score very low on Flesch-Kincaid, about grade 2 overall. The real problems are jargon and service-speak ("triage", "triage level", "complaint group", "clinician", "follow-up", "department's current estimate for new arrivals") and wording that can be read two ways.

### Cited Findings
- The NHS service manual aims for "a reading age of 9 to 11 years old". Where medical content makes that hard, an 11–14-year-old should still understand it. It also says to keep sentences to 20 words or fewer and paragraphs to 3 sentences or fewer, to use active voice, and to avoid medical jargon or explain it with the plain term first, as in "piles (haemorrhoids)". It warns against subjective reassurance and asks for precise symptom wording — [NHS service manual: How we write](https://service-manual.nhs.uk/content/how-we-write)
- The NHS has a dedicated health-literacy content page because many adults have low health literacy — [NHS service manual: Health literacy](https://service-manual.nhs.uk/content/health-literacy). An NHS Digital blog reports that more than 6 in 10 adults struggle with health content that includes numbers and statistics. It also found that relying on reading age alone "is not enough": restructuring the content worked better than simplifying words — [NHS Digital blog: Creating better content for users with low health literacy (2019, proxy copy)](https://nhsd-proxy.openprescribing.net/blog/transformation-blog/2019/creating-better-content-for-users-with-low-health-literacy)
- NHS trust guidance turns this into a Flesch-Kincaid grade of 6.0 or lower, about reading age 11 — [NENC NHS writing for health literacy (docx)](https://www.northeastnorthcumbria.nhs.uk/media/1q2mmknb/writing-for-health-literacy-overview-final.docx)
- The AMA and NIH are widely cited as recommending patient materials at no higher than grade 6. Some sources quote NIH as grade 8. Most published patient materials are above both targets: 97% of one large set of AAOS articles scored above grade 6 — [Readability of AAST patient education materials, PMC4139691](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4139691/)
- In Canada, a 2022 Treasury Board document set a maximum of Grade 8 for communications products — [TBS BT39-71-2022](https://publications.gc.ca/collections/collection_2022/sct-tbs/BT39-71-2022-eng.pdf). The Canada.ca Content Style Guide's plain-language section was rewritten in August 2024 because readability formulas "research doesn't support" were being relied on. The new guidance follows the international plain-language standard and favours testing over formulas — [Digital Transformation Office, Oct 2024](https://digital.canada.ca/2024/10/17/plain-language-updates-to-the-canada.ca-content-style-guide/)
- The City of Calgary targets grade 8 for general content and grades 10–14 for highly technical topics — [Calgary.ca reading level](https://www.calgary.ca/content/reading-level.html). B.C. also aims for grade 8 — [B.C. plain language checklist](https://www2.gov.bc.ca/gov/content/governments/services-for-government/service-experience-digital-delivery/web-content-development-guides/web-style-guide/writing-guide/plain-language). The Government of Alberta's guidance stresses active voice and short sentences — [Alberta.ca plain language](https://www.alberta.ca/plain-language)
- The CDC Clear Communication Index has 20 yes/no items scored out of 100, and 90 or more passes. Its core items are one main message (1–3 short sentences) combined with a call to action that tells people what to do — [CDC Clear Communication Index user guide](https://Cdc.gov/ccindex/pdf/clear-communication-user-guide.pdf). A shortened 13-item, 4-dimension version exists for short-format communication, and it also uses a pass mark of 90. Real public-health web content averages about 54 — [JMIR 2026, Chinese CCI adaptation](https://www.jmir.org/2026/1/e83935)
- GOV.UK patterns let people answer "I do not know" or "I'm not sure" on any question where that is a valid answer — [GOV.UK Question pages](https://design-system.service.gov.uk/patterns/question-pages/)
- Recheck measurement (this audit, a scripted Flesch-Kincaid using the standard formula and a heuristic syllable count, on 25 patient strings): the combined grade is about 2.1. The only string above grade 6 is `patient.departmentWait` ("The department's current estimate for new arrivals is about…"), at about grade 11.9. The takeover message is about grade 6.1. All other strings are grade 0–5. (Measured locally; no external source.)

### Inferences
- Formulas cannot catch Recheck's real reading problems, so add a jargon blocklist test over `en.json` patient keys. Terms to block: triage, clinician, complaint, CTAS, assessment, estimate for new arrivals, follow-up, device, active. This matches the Canada.ca move away from formulas and the NHS "reading age alone is not enough" finding.
- A digital "teach-back" substitute can be built from patterns already in the app. After each send, say plainly what happens next and what the person should do, which is the CDC call to action. Check understanding through behaviour, not quizzes: show a "What happens now" line, and offer "That's not what I meant" or "Change my answer" before the final send. A pass that shows answers back for checking adds friction for unwell users, so keep it to one screen at most, and skip it entirely on urgent paths. The GOV.UK "Check answers" pattern exists, but this deck did not retrieve its page.
- Use "doctor or nurse" rather than "clinician". In patient copy, use "the nurse who first saw you" or "the front desk" rather than "triage", or give the plain term first and "triage" in brackets once, following the NHS rule.

### Gaps
- I did not retrieve the primary AMA or NIH documents that set the grade-6 target. The figure comes from secondary readability studies.
- I found no Alberta Health Services patient-material reading-level standard. See the companion [Alberta and AHS notes](alberta-ahs.md) if they cover it.
- I found no validated digital teach-back method for acute-care triage apps. The recommendation above is inferred from the CDC and GOV.UK patterns.

## Accessibility: WCAG 2.2 AA, older adults, low vision, tremor, pain and stress, screen readers, GOV.UK/NHS question patterns

### Takeaway
The criteria that matter most here are these:
- 2.5.8 Target Size: Recheck passes, since every tap target is 44 px or more.
- 2.4.11 Focus Not Obscured: Recheck uses scroll-padding (technique C43), but the 142 px value is fixed.
- 1.4.10 Reflow and 1.4.4 Resize Text: at risk, because the dock is fixed and font sizes are set in px.
- 4.1.3 Status Messages: mostly good.
- 2.2.1 Timing Adjustable: met by the "I can't do this" alternative in the circle check.
- 3.2.6 Consistent Help: the dock is consistent, but it is missing on the QR exchange screen.
- 1.3.1 and 4.1.2: answer choices are toggle buttons, not radio or checkbox groups.
- 3.1.1 and 3.1.2 Language: the language switch does not change `lang`, and there are no translations.

Older adults make about 4× more touch errors and benefit from targets of at least 10–11 mm with clear spacing.

### Cited Findings
- **2.5.8 Target Size (Minimum, AA)**: targets must be at least 24×24 CSS px, or be spaced so that a 24 px circle centred on each target does not overlap another. **2.5.5 (AAA)** asks for 44×44 px — [W3C Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- **2.4.11 Focus Not Obscured (Minimum, AA)**: a focused component must not be "entirely hidden due to author-created content". Sticky footers and headers are the named risk. Failure F110 is a "sticky footer or header completely hiding focused elements". Technique C43, "Using CSS scroll-padding to un-obscure content", is sufficient. Under 2.4.12 (AAA), "none of the component receiving focus should be obscured" — [W3C Understanding 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- **2.2.1 Timing Adjustable (A)**: every time limit must be possible to turn off, adjust (to at least 10×) or extend. The exceptions are real-time, essential (where removing the limit would "fundamentally change" the activity and no conforming alternative exists), and limits over 20 hours. Content that disappears on a timer counts as a time limit unless the same information or function is available another way — [W3C Understanding 2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)
- **1.4.10 Reflow (AA)**: content must work at a 320 CSS px width, which is 400% zoom of a 1280 px viewport, without two-dimensional scrolling. Sticky and fixed content that takes up the viewport at high zoom is a known reflow problem — [W3C Understanding 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). **1.4.4 Resize Text (AA)**: 200% text without loss of content or function — [W3C Understanding 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- **4.1.3 Status Messages (AA)**: status changes that do not move focus, such as "sending", "saved" or "failed", must be exposed through roles like `status` or `alert` so assistive technology announces them — [W3C Understanding 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- **3.2.6 Consistent Help (A, new in 2.2)**: if help mechanisms appear on multiple pages, they must appear in the same relative order — [W3C Understanding 3.2.6](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html)
- **1.4.3 Contrast (AA)**: 4.5:1 for text, 3:1 for large text. Inactive (disabled) components are exempt — [W3C Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). **1.4.11 Non-text Contrast**: 3:1 for UI component boundaries and states — [W3C Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- **3.1.1 / 3.1.2 Language of Page / Parts (A / AA)**: the page language and any passage in another language must be marked up so screen readers pronounce it correctly — [W3C Understanding 3.1.2](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html)
- **2.3.1 Three Flashes or Below Threshold (A)**: nothing may flash more than 3 times per second above the general flash and red flash thresholds — [W3C Understanding 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)
- **Older adults and touch**: a W3C research summary cites a 10 mm minimum (Lee & Zhai 2009) and 11.43 mm for older users (Jin et al. 2007) — [W3C Mobile A11y TF: target size research](https://www.w3.org/WAI/GL/mobile-a11y-tf/wiki/Summary_of_Research_on_Touch/Pointer_Target_Size). A review reports that older adults make about 4× the touch error rate of younger adults (Chung et al. 2010). ANSI/HFES 100-2007 recommends targets of 9.5 mm or more with a 3.2 mm gap. The same review gives 19.05 mm for Jin et al., so the sources conflict on that study — [PMC3572909](https://pmc.ncbi.nlm.nih.gov/articles/PMC3572909/). Younger adults underestimated the smallest target they could accurately hit by about 6 mm, while older adults judged their own needs better — [Franz, Findlater & Wobbrock, ASSETS '19](https://faculty.washington.edu/wobbrock/pubs/assets-19.06.pdf)
- **GOV.UK question pages**: "Start by asking one question per page". Make the question the page heading through the `<legend>` or `<label>` so screen readers hear it once. Do not reuse page headings. "Always include a Back link component at the top of question pages". Label the button "Continue" and left-align it. Test without a progress indicator first, and use a simple one only if research shows it helps — [GOV.UK Question pages](https://design-system.service.gov.uk/patterns/question-pages/)
- **NHS care cards** carry hidden text such as "Urgent advice:" so screen reader users get the level, because "People with visual disabilities may not recognise care cards by their colour". The heading must state the action — [NHS design system: Care cards](https://service-manual.nhs.uk/design-system/components/care-cards)
- Recheck measured contrast, computed locally from `index.css` tokens:

  | Colour pair | Ratio | Result |
  | --- | --- | --- |
  | Muted text #6e6e73 on white | 5.07:1 | Pass |
  | Muted text #6e6e73 on the canvas #f5f5f7 | 4.66:1 | Pass, but narrow |
  | White on red #d70015 (help button) | 5.38:1 | Pass |
  | Red on red-bg #ffebee | 4.71:1 | Pass |
  | Brand-600 #0066cc on white | 5.57:1 | Pass |
  | Brand-500 #0071e3 on the canvas (selected border and focus) | 4.31:1 | Passes 3:1 non-text |
  | Answer-button border #d2d2d7 on white | 1.51:1 | Unselected outline is below 3:1 |

  The 1.51:1 border is allowed under 1.4.11, because a button's boundary is not required when its text identifies it, but it is weak for low vision.

### Inferences
- **The dock and 2.4.11 / 1.4.10.** `html:has(.patient-shell.has-dock){scroll-padding-bottom:calc(142px + safe-area)}` is the right technique (C43), but it is hard-coded. The dock has two rows of 2-line, 14 px labels, and it grows taller at 200% text or with longer Punjabi or Tagalog strings. Focus could then be hidden behind it. At 320 px and 400% zoom the dock could fill most of the viewport. Measure the dock with a `ResizeObserver`, write the height to a CSS variable used for both `padding-bottom` and `scroll-padding-bottom`, and at large text sizes collapse the dock to "I need help now" plus a "More" sheet.
- **px font sizes.** `.patient-shell{font-size:18px}`, `.patient-dock button{font-size:14px}` and `.patient-context{font-size:15px}` ignore the browser's default font-size preference, which many older adults raise. Use `rem`.
- **Answer semantics.** `AnswerButton` uses `aria-pressed` toggle buttons for single-choice questions. A screen reader hears separate "toggle button, not pressed" items with no group name and no "1 of 6" position. Single-choice questions should be a `radiogroup`, using native `<input type=radio>` inside `<fieldset><legend>` where the legend is the h1, following GOV.UK. Multi-select questions should be checkboxes in a fieldset.
- **Pain, stress and tremor.** Answer rows are 56 px or more (`min-h-14`, about 15 mm), which is good. The dock buttons are 44 px with 6–8 px gaps, which meets AA and AAA. However, "I'm leaving" sits right next to "I need help now", and "Finish later" sits just above the dock edge, which risks mis-taps. Use more separation and put the destructive or terminal action furthest from the urgent one.
- **Circle check and 2.2.1.** The timed shapes are arguably "essential", because timing is what the check measures. Either way, "I can't do this" and "I'm not sure" give a conforming alternative with no time pressure, which satisfies the criterion. The contract allows `show_ms ≥ 200` and `gap_ms ≥ 0`, which permits up to 5 shape changes per second. The shapes are small (80 px), so the general-flash area threshold is unlikely to be reached, but set a server floor of `show_ms + gap_ms ≥ 334 ms` so it never exceeds 3 per second.

### Gaps
- I did not fetch the GOV.UK Button component page. Its advice to avoid disabled buttons is well known, but I did not re-verify it in this session, so treat it as unverified.
- I found no published study of screen-reader behaviour in one-question-per-page health check-ins specifically.
- I did not test with VoiceOver or TalkBack. The semantics issues are inferred from the code.

## Urgent and safety messaging: "I need help now", the urgent screen, red usage, avoiding alarm, never implying "all clear"

### Takeaway
Follow the NHS care-card model:
- Make the heading the action, as Recheck's "Tell a staff member now" already does.
- Use one emergency treatment per screen, with no competing links.
- Give the urgency level in text as well as colour.
- Keep red only for the emergency action.
- Aim to "reassure people, not to scare them".
- After any report, say what happens next and keep the help route visible, but never imply the person is cleared.
- In the urgent offline state, say explicitly that staff do not know yet.

### Cited Findings
- NHS care cards come in three levels. Non-urgent is blue ("See a GP if:"). Urgent is red ("Ask for an urgent GP appointment or get help from NHS 111 if you have:"). Emergency is red and dark grey ("Call 999 or go to A&E now if:"). Each heading is "one clear call to action". The emergency card may carry one action link (find A&E) and "Don't include other links in this card". Avoid using too many cards. The stated aim is "We want to give essential information and reassure people, not to scare them." Colour is backed by the heading text and hidden screen-reader text — [NHS design system: Care cards](https://service-manual.nhs.uk/design-system/components/care-cards)
- The CDC Index asks for a single main message plus an explicit call to action — [CDC Clear Communication Index user guide](https://Cdc.gov/ccindex/pdf/clear-communication-user-guide.pdf)
- The NHS content guide warns against subjective reassurance such as "a good chance of recovery" — [NHS How we write](https://service-manual.nhs.uk/content/how-we-write)

### Inferences
- **Urgent card.** Recheck's urgent card already matches the emergency care-card model: an action heading, a stop-sign icon plus colour plus text, the dock hidden so there are no competing choices, focus moved to the heading, and status in `role="status"`. Keep it.
- **The red "I'm telling staff" button.** It is a full-width red primary button, but it only dismisses the card. Red then means both "emergency" and "close", and a frightened user may tap it to make the screen go away. Make it a neutral secondary button and keep red for the heading and icon.
- **"Answer a follow-up".** It competes with "go to staff now". Label it with order and effort, such as "After you've told staff: answer 2 more questions", and render it below a divider.
- **Offline urgent state.** The queued text "Saved on this phone. It will send when you reconnect." does not say that staff do not know yet. On an urgent screen that is a safety gap. Use: "Not sent yet. Staff do not know. Tell a staff member now."
- **Never "all clear".** The sent screen's "Staff will still check on you on their own schedule" is a good safety net. Make it warmer and add the action: "Staff will keep checking on you. If you feel worse, press 'I need help now'."
- **Red elsewhere.** "Yes, I'm leaving" and every error banner also use red (`variant="danger"`, `bg-level-red-bg`). That dilutes red's meaning. Use neutral or dark styling for leaving, and amber or ink for errors that are not emergencies.
- **Alarm fatigue.** Three entry points overlap: "Report a change" (home), "I'm worried I'm getting worse" (dock) and "I need help now" (dock). Each needs a distinct, plainly described purpose. Possible labels: "I need help now" (can't wait), "I feel worse" (not an emergency), "New symptom" (pick from a list).

### Gaps
- I did not retrieve the NHS 111 online or NHS.uk "call 999" interstitial pages directly. The care-card component is the canonical published pattern.
- I found no study of accidental presses of patient-facing "help now" buttons in EDs, or of whether to add a confirmation. Recheck's current no-confirm, send-immediately design favours speed, which is defensible but untested.

## Wait-time communication: does showing estimates help, and how to phrase them

### Takeaway
Patients strongly want wait information, and getting it is linked to higher satisfaction. Lack of information and "feeling forgotten" affect satisfaction more than the wait itself. One RCT found that giving a single category-average estimate at triage did not change satisfaction. Present estimates as rounded ranges with honest uncertainty, say who the estimate is for, and pair them with "time waited" and regular updates. Do not present them as a personal promise.

### Cited Findings
- **RCT, Saudi ED, Nov 2023, n=190.** Giving the mean wait for the patient's triage category at triage did not change satisfaction: 3.51 vs 3.49, P=0.962. Concern was "very" high in 41% of controls vs 14% of the intervention group, which was not significant (P=0.24). 81.4% at triage wanted estimates displayed. LWBS and anxiety were not measured as outcomes, and the study is small and single-centre — [Almulhim et al., J Family Community Med 2025, PMC11864359](https://pmc.ncbi.nlm.nih.gov/articles/PMC11864359/)
- **Netherlands ED survey, n=423.** Wait time was the most-wanted information: 75% of those wanting more information asked for it. Only 36% were satisfied with the wait information they got. Those who received wait information were significantly more satisfied (P<0.001). Cited prior studies found patients preferred updates about every 30–41 minutes. The study cites Welch (2010): lack of information about progress and delays affects satisfaction more than perceived waiting time — [de Steenwinkel et al., Int J Emerg Med 2022, PMC8903487](https://pmc.ncbi.nlm.nih.gov/articles/PMC8903487/)
- **Swiss waiting-room study.** Wait perception was driven by an appropriate assessment of urgency, the feeling of being forgotten, privacy, and lack of information about the exact waiting time — [Patients' time perception in the waiting room (BMC Emerg Med 2019)](https://d-nb.info/1202113060/34)
- **Mixed-methods study.** Patients left because of prolonged waits without updates from staff, overcrowding, and improving symptoms. The title quote is "They just don't want to feel forgotten" — [PMC11963722](https://pmc.ncbi.nlm.nih.gov/articles/PMC11963722/). Prolonged waiting and overcrowding were the main reasons for leaving without being seen — [PMC11742075](https://pmc.ncbi.nlm.nih.gov/articles/PMC11742075/)
- The NHS content guide calls for stating timeframes precisely rather than vaguely, for example "It takes X weeks to get an appointment" — [NHS How we write](https://service-manual.nhs.uk/content/how-we-write). Many adults struggle with numbers in health content — [NHS Digital blog](https://nhsd-proxy.openprescribing.net/blog/transformation-blog/2019/creating-better-content-for-users-with-low-health-literacy)

### Inferences
- **Current copy.** Recheck's text is "The department's current estimate for new arrivals is about 4 h 47 min. You've been waiting 55 min." It is honest that the figure is not personal, which is correct. But it reads at about grade 12, uses abbreviations, and gives false precision. A patient who has waited 55 minutes may also read "4 h 47 min" as their own remaining wait.
- **Replacement.** Round the figure and give a range: "Right now, people who just arrived may wait about 4 to 5 hours. Your wait could be shorter or longer. It depends on how sick everyone is." Then on its own line: "You have waited 55 minutes."
- **What the estimate measures.** Name it only if the data source defines it, for example "to see a doctor". If it does not, say "to be seen".
- **Freshness.** Show "Updated 9:40 pm" so stale figures are visible, and refresh about every 30 minutes in line with patient preferences.
- **Place in line.** "Your answers never change your place in line" is true and important, but it can be misread as "there's no point answering". Use: "Your answers go to staff. They do not move you up or down the line."

### Gaps
- I found no study isolating how displaying wait estimates affects LWBS rates. The Canadian "90.8% want waits posted" figure appeared only in a search snippet and could not be traced to a citable primary source, so it is excluded.
- I found no evidence on ranges versus point estimates in ED patient comprehension specifically. The range recommendation is inferred from the numeracy guidance.

## Multilingual delivery: professional translation, unavailable translations, interpreters, scripts

### Takeaway
Clinical questions need professional translation with independent review (back-translation or two-way review), not machine translation. Machine translation of ED instructions was 55–94% accurate depending on language and is described as "not ready for prime time". Until translations exist, do not let the picker suggest the app is in Punjabi or Tagalog. Say clearly, in the target language, that questions are English-only and how to get an interpreter. Mark up language and direction correctly.

### Cited Findings
- **Google Translate on 100 sets of ED discharge instructions.** Spanish was 92% correct and Chinese 81%. Potentially clinically significant harm occurred in 2% of Spanish and 8% of Chinese translations. Errors clustered on colloquial phrasing, jargon and long sentences. One example: "hold the kidney medicine" became "keep taking" it. The authors say machine translation should supplement, not replace, English text — [Khoong et al., JAMA Intern Med 2019, PMC6450297](https://pmc.ncbi.nlm.nih.gov/articles/6450297); [AHRQ PSNet summary](https://psnet.ahrq.gov/issue/assessing-use-google-translate-spanish-and-chinese-translations-emergency-department)
- **Taira et al.** Google Translate accurately conveyed 82.5% of ED instructions overall, ranging by language from 55% (Armenian) to 94% (Spanish). It "is not ready for prime time use in the emergency department". This is a secondary summary; Punjabi and Tagalog were not reported there — [Slator summary of Taira et al.](https://tech.slator.com/google-translate-not-ready-for-use-in-medical-emergencies-but-improving-fast-study/)
- **CMS Toolkit Part 11**, "Guidelines for Culturally Appropriate Translation", covers several approaches: creating material separately in each language, one-way translation, and two-way or back translation. It also covers using skilled translators, reviewer feedback and final proofreading, and it lists common translation-quality problems — [HHS: Toolkit Part 11](https://www.hhs.gov/guidance/document/toolkit-part-11-guidelines-translation)
- **AHS interpretation.** AHS reported 1.2 million minutes of phone interpretation across 81 languages in one year. Some South Zone EDs have "Interpreter on Wheels" units. Patients and families are expected to tell staff they need an interpreter. These are secondary summaries of AHS pages — [AHS languages](https://www.albertahealthservices.ca/languages/languages.aspx); [AHS news](https://www.albertahealthservices.ca/news/Page17661.aspx)
- **Language markup.** WCAG 3.1.1 and 3.1.2 require the page and passage language to be identified — [W3C Understanding 3.1.2](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html). For right-to-left scripts (Arabic, Urdu), set `dir="rtl"` on `<html>` alongside `lang`, and use logical CSS properties — [W3C i18n: Structural markup and right-to-left text in HTML](https://www.w3.org/International/questions/qa-html-dir)
- **Taglish.** Tagalog–English code-switching is a normal register of spoken and written Filipino. A study of Metro Manila speech describes it as "the normal acceptable conversation style of speaking and writing" — [Wikipedia: Taglish](https://en.wikipedia.org/wiki/Taglish); [U-Michigan thesis](https://deepblue.lib.umich.edu/handle/2027.42/139623)

### Inferences
- **Current state.** `pa.json` and `tl.json` are empty, so selecting ਪੰਜਾਬੀ or Tagalog leaves the whole UI in English. The "Questions are shown in English for now…" notice falls back to English too, so the person who needs it cannot read it. `<html lang="en">` never changes, and the ਪੰਜਾਬੀ option has no `lang="pa"`, so screen readers mispronounce it.
- **Fix in steps:**
  1. Professionally translate the short UI shell first (dock, urgent card, notice) and back-check it. That is about 60 strings.
  2. Show the notice in the chosen language and in English.
  3. Update `document.documentElement.lang` (and `dir`) on change.
  4. Mark the languages in the picker with their own `lang`.
  5. Keep the clinical questions in English until each item is translated and reviewed.
- **Tagalog.** Have Filipino reviewers decide whether familiar English loanwords should stay. Common Taglish practice suggests some terms (for example "nurse", "check-in") may be clearer left in English, but test this.
- **Punjabi.** Use Gurmukhi with a font stack that includes Noto Sans Gurmukhi. Test line height, because Gurmukhi has marks above and below the line, and test 2-line dock labels for clipping.
- **Interpreter route.** Say how to get an interpreter in each language, for example "Ask any staff member for an interpreter. It is free." Only claim "free" once the site confirms it.

### Gaps
- I found no published accuracy data for machine translation into Punjabi or Tagalog for clinical text.
- I could not confirm from a primary AHS page that ED interpretation is free to patients, or how to request it in Calgary EDs.
- I found no evidence on the best way to show a partially translated UI (mixed language versus all-English with a notice).

## Trust, consent and privacy for a QR health web app on personal or shared phones

### Takeaway
Use a layered, just-in-time notice. The short top layer should say what is collected, who sees it, that the app does not replace staff, and how to sign out. The detail goes behind a disclosure. Avoid long legalistic text. Because the session uses a cookie on a phone that may be shared or borrowed, tell people plainly that anyone holding this phone can see and send, and make signing out easy.

### Cited Findings
- **OPC mobile-app guidance** recommends icons and layered privacy notices, with key information at the top layer. One summary says the top layer should be understandable in under two minutes. It also recommends just-in-time notices, because people cannot be expected to remember up-front consent, while warning against "notice fatigue" — [CIPPIC summary of OPC mobile guidance](https://cippic.ca/mobile_privacy_guidelines)
- **The joint OPC / Alberta / B.C. Guidelines for Obtaining Meaningful Consent** took effect January 1, 2019. They criticise "lengthy, legalistic privacy policies" and present just-in-time notices as an alternative to getting all consents up front — [Mondaq summary](https://www.mondaq.com/canada/privacy-protection/708516/privacy-commissioner-issues-key-guidelines-for-consent-and-inappropriate-data-practices)

### Inferences
- **Current panel.** Recheck's "What we store" is a keyboard-accessible `<details>` with 5 short bullets, which is good layering. But it says nothing about who sees the answers, that the app is not the medical chart, that it does not replace telling staff, or shared-phone risk.
- **Phrases that leak jargon.** "Your triage level and complaint group" should be "How urgent the nurse rated your visit, and the main reason you came in". The exchange screen has no "what this is" line before people choose a role.
- **Shared phones.** The sign-out help says "anyone can sign in again by scanning the QR code". That is honest, but anyone who photographs the QR can take over. Say instead: "Keep the code private. Anyone with it can sign in." Also add a one-line reminder to sign out when handing the phone back.

### Gaps
- Alberta public-body health data falls under Alberta's Health Information Act, not PIPEDA. I did not retrieve HIA notice requirements or the custodian's required wording. A site privacy officer must approve the final notice.
- I did not retrieve the primary OPC pages. The findings above come from secondary summaries.

## Companion mode: separating what the companion observes from what the patient feels

### Takeaway
Observers should report only what they can see or hear: signs, events and behaviours. They should not report feelings that only the patient knows. Regulators discourage "proxy" questions about inner states. Recheck's companion wording mostly does this ("How do they seem right now?", "have you noticed…"). The pain question is correctly skipped for companions. Put "you" (companion) and "they" (patient) in every companion string, including the dock.

### Cited Findings
- An observer-reported outcome (ObsRO) is "based on a report of observable signs, events, or behaviors related to a patient's health condition by someone other than that patient or a health professional". It does not include medical judgment — [NCATS Toolkit glossary](https://toolkit.ncats.nih.gov/glossary/observer-reported-outcomes/)
- FDA guidance limits observer reports to events or behaviours that can be observed. "Proxy-reported" measures of concepts known only to the patient (for example pain severity) are discouraged — [DIA Global Forum, Oct 2024](https://globalforum.diaglobal.org/issue/october-2024/pros-and-obsros-in-pediatric-clinical-trials-measure-selection-and-implementation/)

### Inferences
- **The companion question bank** already follows the ObsRO principle:
  - "How do they seem right now?"
  - "Compared with when staff last checked on them, how do they seem?"
  - "Since they arrived, have you noticed any of this start or get worse?"
  - Dock: "They need help now", "I'm worried they're getting worse", "The patient is leaving"

  Keep these.
- **Gaps in companion copy:**
  - Home title: "You are helping with a check-in" should be "You're answering for someone you're with", plus "Tell us what you see or hear. Only they can tell us how they feel inside."
  - Urgent body: give companions their own version: "Get a staff member now, or call out. Stay with them if you can."
  - Some finding options are in first person ("Worst headache of my life") and are shown to companions. That is clinical content, so flag it to the question-bank owners rather than changing it here.

### Gaps
- I found no ED-specific usability study of companion or proxy reporting UIs.

## Audit

Legend: **Keep** · **Change → replacement** (grade ≈6 or lower, ≤20 words) · **Add** · **Remove**. String keys refer to `web/src/i18n/en.json` unless they come from the question bank (QB).

### Global shell (`PatientLayout.tsx`)
- **Header language picker.**
  - Change: show a visible "Language" text label, or keep the icon and enlarge it.
  - Add: `lang` on each `<option>` (`pa`, `tl`).
  - Add: on change, set `document.documentElement.lang` (and `dir` for future RTL languages).
  - Only list a language once its UI strings exist, or label it "ਪੰਜਾਬੀ (English questions)" — [WCAG 3.1.1/3.1.2](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html).
- `patient.languageNotice`: "Questions are shown in English for now. Ask a staff member if you need help in another language."
  - Keep the meaning.
  - Change: render it in the selected language and in English: "The questions are in English for now. Ask any staff member for an interpreter."
- `patient.placeInLine`: "Your answers never change your place in line."
  - Change → "Your answers go to staff. They do not move you up or down the line."
- `patient.departmentWait`: "The department's current estimate for new arrivals is about {{estimate}}." (grade ≈12)
  - Change → "Right now, people who just arrived may wait about {{range}}. Your wait could be shorter or longer."
  - Render `{{range}}` as rounded words such as "4 to 5 hours", not "4 h 47 min".
  - Add "Updated {{time}}".
- `patient.waitUnavailable`: "Estimate unavailable."
  - Change → "We can't show a wait time right now."
- `patient.waited`: "You've been waiting {{waited}}."
  - Change → "You have waited {{waited}}." Spell out units, as in "55 minutes" or "1 hour 10 minutes".
- `outbox.saved`: "Saved, will send when connected ({{count}} waiting)."
  - Change → "Not sent yet. We will keep trying. If you feel worse, tell a staff member now."
- `privacy.title`: "What we store"
  - Change → "Who sees your answers".
  - Add as the first visible line, before the disclosure: "ER staff see your answers. This is not your medical chart."
- `privacy.stored1`: Keep.
- `privacy.stored2`: "Your triage level and complaint group."
  - Change → "How urgent the nurse rated your visit, and the main reason you came."
- `privacy.stored3`: "What staff did in response."
  - Change → "What staff did about your answers."
- `privacy.notStored`: Keep, if accurate.
- `privacy.synthetic`: Keep for the demo.
- **Add** to the privacy panel:
  - "Anyone holding this phone can see this page. Sign out before you lend it."
  - "Keep your code private."

### QR exchange (`Exchange.tsx`, screenshot patient-phone-01)
- `exchange.who`: "Who is using this phone?" Keep.
- **Add** an intro above it: "Use this page to tell ER staff if things change while you wait. It does not replace talking to staff."
- `exchange.role.patient` / `.companion`: Keep.
  - Add a hint under the companion choice: "Family member or friend answering for them."
- **Add** a help line on this screen: "Feeling much worse? Tell a staff member now." The dock is absent here, and an unwell person might scan the code mid-crisis.
- `exchange.inactive`: "This code is no longer active. Please speak to the triage desk."
  - Change → "This code does not work anymore. Please ask a staff member for a new one."
- `exchange.askDesk`: "Ask the triage desk for a new code."
  - Change → "Ask a staff member for a new code."
- `exchange.failed`: "That did not work. Please try again, or speak to the triage desk."
  - Change → "That did not work. Try again, or ask a staff member."
- `exchange.takeover.title`: "This will sign out the other device"
  - Change → "Another phone is already signed in".
- `exchange.takeover.who`
  - Change → "{{who}} signed in on another phone at {{time}}. Only one phone can be used. If you go on, that phone will be signed out."
- `exchange.takeover.confirm`: "Sign out the other phone and continue"
  - Change → "Use this phone instead".
- `exchange.takeover.cancel`: Keep.
- **Takeover card.** Remove `role="alert"` from the whole card with its buttons. Announce only the heading or focus it, because alerts that include controls are verbose.
- `exchange.signedOut.title` / `.help`
  - Keep the title.
  - Change the help → "If you need help now, tell a staff member. To sign in again, scan the code the nurse gave you."
- `pages.patientEntry`: "Opening your check-in" Keep.

### Home (`CheckIn.tsx` Home, screenshots 03-home and patient-phone-03)
- `patient.title`: "You are checked in"
  - Change → "You're signed in". "Checked in" clashes with ED registration and the app's own "check-in", and can feel like "all set".
  - **Add** a subline: "Answer a few questions now and then, so staff know how you are."
- `patient.titleCompanion`: "You are helping with a check-in"
  - Change → "You're answering for someone".
  - Add: "Tell us what you see or hear."
- `patient.startCheckin`: "Start check-in"
  - Keep.
  - Add effort: "About 1 minute · {{n}} questions".
- `patient.nextCheckin` with `CountdownChip`: Keep "Next check-in: in 9 minutes".
  - Change the overdue state for patients from "{{value}} overdue" (grey bold) to "Ready now". Don't blame patients.
  - Spell out "minutes".
- `patient.reportChange`: "Report a change"
  - Change → "Tell us about a new symptom". This separates it from the dock's "feel worse" button.
- `patient.signOut`: "Sign out of this phone" Keep.
- `patient.signOutHelp`
  - Change → "This phone will stop sending check-ins. You keep your place in line. To sign in again, scan the code."
  - Remove "anyone can".
- `patient.signOutConfirm`: Keep. Cancel: Keep.
- `patient.signOutFailed`
  - Change → "Could not sign out. Try again."
- `message.none`: Keep.
- `message.clinician_will_check`: "A clinician will check on you."
  - Change → "A doctor or nurse will come to check on you." Only if the site guarantees it; otherwise "We told a doctor or nurse."
- `message.clinician_told`
  - Change → "We told a doctor or nurse."
- `message.leaving_info`
  - Change → "Please tell a nurse before you leave. If you feel worse later, come back right away." Clinical team to confirm whether to add 911.

### Check-in flow (`CheckinFlow.tsx`, screenshot patient-phone-03)
- `flow.progress`: "Question {{n}} of {{total}}" plus a bar. Keep. GOV.UK says to test it, and a known end point helps distressed users.
  - Make sure the total never jumps up mid-flow.
- `flow.next`: "Next" Keep. Plain, and short for translation; GOV.UK's "Continue" is optional.
- **Disabled Next/Send** (pale blue in the screenshot).
  - Change: keep the button enabled. On press with no answer, show an inline error linked to the group: "Choose an answer, or choose 'I'm not sure'."
- `flow.back`: "Back"
  - Change placement: move it to the top-left as a back link, as GOV.UK puts it, rather than a small ghost button under the main action.
- `flow.finishLater`: "Finish later"
  - Change → "Stop and send what I've answered". When nothing is answered: "Stop for now".
  - Move it away from the dock edge.
- `flow.finishLaterHelp`: Keep the text. Change the size from 14 px `text-sm` muted to body size.
- `flow.sendNow`: "Send warning signs now"
  - Change → "Send to staff now".
- `flow.send`: "Send"
  - Change → "Send to staff".
- `answer.unsure`: "I'm not sure" Keep (GOV.UK).
- `pain.low` / `pain.high`: Keep.
- QB "Tick all that apply": flag to the QB owners. "Choose all that apply" is more familiar in Canada, and it should render as hint text under the heading, not inside the h1.
- **Semantics.**
  - Change single-choice questions to `fieldset` + `legend` (the h1) with radio inputs, or `role="radiogroup"` with `role="radio"` and `aria-checked`.
  - Change multi-select questions to checkboxes in a `fieldset`.
- **Long finding list** (13 options + "None" + "Not sure", screenshot 04).
  - Add "Choose all that apply" as a hint.
  - Keep the Send button reachable; consider a sticky Send once anything is ticked.

### Circle check (`CircleCheck.tsx`)
- `circle.intro`: Keep.
- `circle.once`: Keep.
  - **Add**: "This is not a medical test. If it's hard, staff will simply come and check on you."
- `circle.watch`, `circle.countLabel`, `circle.fewer`, `circle.more`: Keep. The aria-labels are good and `output aria-live` is correct.
- `circle.confirm`: "That is my count"
  - Change → "Done".
- `circle.cantDo`: Keep. It is the 2.2.1 alternative.
- **Add** a server floor so shapes change at most 3 times per second (2.3.1).

### Report a change (`ReportChange`, screenshot 04-change)
- h1 from QB: Keep.
- `change.send`: "Send to staff" Keep.
- `flow.back` at the bottom: move it to the top.
- Disabled Send: use the same error pattern as the check-in flow.

### Urgent card (screenshots 05 and 07)
- `urgent.title`: "Tell a staff member now" **Keep** (action heading, care-card model).
- `urgent.body`: "Go to the nearest staff member or call out for help." Keep.
  - **Add** a companion variant: "Get a staff member now, or call out. Stay with them if you can."
  - **Add** for anyone who can't move: "If you can't walk, call out or ask someone near you."
- `urgent.sending`: "Sending your report…" Keep.
- `urgent.sent`: "Your report was received."
  - Change → "Staff got your message. Still tell someone now."
- `urgent.queued`: "Saved on this phone. It will send when you reconnect."
  - **Change (P1)** → "Not sent yet. Staff do not know. Tell a staff member now."
- `urgent.failed`: "Your report was not sent."
  - Change → "Not sent. Staff do not know. Tell a staff member now."
- `urgent.retry`: "Try sending again" Keep.
- `urgent.telling`: "I'm telling staff" (red, full-width)
  - Change → "OK" or "Close", styled neutral or secondary. Keep red only on the heading and icon.
- `urgent.followup`: "Answer a follow-up"
  - Change → "After you tell staff: answer {{n}} more questions". Place it below a divider.
- **Add** hidden screen-reader prefix text "Emergency:" before the heading, per the NHS care-card pattern.

### Help dock (`HelpBar.tsx`, QB `always_visible`)
- "I need help now" (red, icon): **Keep**.
- "I'm worried I'm getting worse": Keep the wording.
  - Change styling so it differs from the two non-clinical buttons, for example amber outline or ink text.
- "Question about my wait or care"
  - Change → "Ask about my wait". This is non-clinical; "care" overlaps with "worried".
- "I'm leaving": Keep the wording.
  - Change position to the furthest corner from "I need help now", with extra gap.
- Layout:
  - Change font from 14 px to ≥16 px in `rem`.
  - Set dock height and `scroll-padding-bottom` from a measured CSS variable.
  - At large text (for example `@media (min-resolution)` or a ResizeObserver threshold), collapse the dock to "I need help now" plus "More options".
- **Add** the dock, or at least "I need help now", to the exchange and signed-out screens, with consistent order (3.2.6).

### Question sent to desk (`desk.*`)
- `desk.title`: "Your question went to the triage nurse"
  - Change → "Your question went to the nurse at the front desk".
- `desk.body`: "The triage nurse will come to you. You do not need to do anything else."
  - Change → "A nurse will come to you when they can. You don't need to do anything else." Avoid an unconditional promise.
- `desk.notClinical`: Keep.

### Leaving (`leaving.*`)
- `leaving.title`: Keep.
- `leaving.info`
  - Change → "Please tell a nurse before you go. If you feel worse later, come back right away."
- `leaving.confirm`: "Yes, I'm leaving"
  - Keep the wording. Change the style from red danger to neutral.
- `leaving.cancel`: Keep.

### Sent screen (`sent.*`)
- `sent.title`: Keep.
- `sent.stillChecking`: "Staff will still check on you on their own schedule."
  - Change → "Staff will keep checking on you. If you feel worse, press 'I need help now'."
- `sent.reported`, `sent.received`: Keep. "Received by the care team" could be shortened to "Staff have it".
- `sent.waiting`: Keep.
- `sent.queuedTitle` / `sent.queuedBody`
  - Change the body → "Not sent yet. We will keep trying. If you feel worse, tell a staff member."
- `sent.back`: "Back"
  - Change → "Back to home".
- `patient.sendFailed`: Keep.

### Prioritised accessibility and safety defects (from code and screenshots)
1. **P1 safety: offline urgent wording.** `urgent.queued` and `outbox.saved` don't tell the person that staff don't know yet (`CheckIn.tsx` urgent card, `PatientLayout.tsx` OutboxBanner).
2. **P1 language (WCAG 3.1.1/3.1.2).** `pa.json` and `tl.json` are empty, so the picker does nothing visible. The English-only notice is itself shown in English. `<html lang>` is never updated, and the options lack `lang`.
3. **P1 semantics (1.3.1/4.1.2).** Single-choice answers are `aria-pressed` toggle buttons with no group, so there is no radio semantics or position. Multi-select has no fieldset or legend (`AnswerButton.tsx`, `CheckinFlow.tsx`).
4. **P1 reflow and focus (1.4.4/1.4.10/2.4.11).** The dock is fixed with a hard-coded 142 px `scroll-padding-bottom` and px font sizes (`index.css` lines ~478–590, 709). At 200% text or with longer translated labels, the dock can exceed 142 px and hide focused controls, and it takes a large share of a small viewport. Recheck still needs a manual test at 320 px and 400%, and a measured-height fix.
5. **P2 no help route on the QR exchange or signed-out screens.** An unwell person mid-scan has no "help now" route. This is consistent-help and safety, not strictly a 3.2.6 failure.
6. **P2 red overload.** Red is used for "I'm telling staff" (a dismissal), "Yes, I'm leaving", the send-failed banner and the exchange error. This dilutes the emergency signal (NHS care-card guidance).
7. **P2 disabled primary buttons.** Next, Send and Send-to-staff are disabled with pale contrast and no reason given (screenshot patient-phone-03). WCAG exempts them, but they leave users stuck. Replace with a validation message.
8. **P2 back control placement and size.** Back is a bottom ghost button, missing on Q1, and small next to "Finish later", which sits just above the dock (tremor risk). GOV.UK puts the back link at the top.
9. **P2 small muted text.** The dock is 14 px, `.question-progress` 14 px, `finishLaterHelp` `text-sm`, and `.patient-context` 15 px muted at 4.66:1 on the canvas. That passes AA but is weak for older or low-vision users. Raise to ≥16 px and use darker ink.
10. **P3 unselected answer border.** #d2d2d7 is 1.51:1 against white. It passes because the text identifies the button, but it is hard to see for low vision. Darken it to ≥3:1.
11. **P3 page title.** `document.title` stays "Recheck" across exchange, check-in and urgent states (2.4.2). Set per-view titles such as "Question 2 of 5 – Recheck" or "Tell a staff member now – Recheck".
12. **P3 circle-check timing.** The contract allows `show_ms ≥ 200` and `gap_ms ≥ 0`. Add a floor so it never exceeds 3 changes per second (2.3.1). "I can't do this" already satisfies 2.2.1.
13. **P3 patient-facing overdue styling.** The CountdownChip shows "N min overdue" in bold to patients. Change it to "Ready now".
