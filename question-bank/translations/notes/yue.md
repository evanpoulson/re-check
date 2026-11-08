# yue (Traditional Chinese, Hong Kong written Chinese) — items for medical translator review

- Register: 你 throughout, following common Hospital Authority patient leaflet usage (not 閣下, which feels distant on buttons). Confirm whether 您 is preferred for older readers.
- Companion wording refers to the patient as 病人 (gender-neutral; avoids 他/她).
- HK terms: 急症室 (ER), 分流站 / 分流護士 (triage), 輪候 (wait), 病徵 (symptoms), 職員 (staff), 醫護人員 (clinician), 剔選 (tick), 屏幕, 登入/登出.
- "Check-in" (periodic prompt) = 情況回報; "checked in" (registration) = 已完成登記. Check naturalness.
- Seizure (fit) = 抽搐（癲癇發作）. Avoided 抽筋 (cramp) and colloquial 發羊吊; translator may add 發羊吊 for older readers.
- Written Chinese kept over colloquial Cantonese; 腹部（肚） used for "belly"; 腿 for "leg" (colloquial 腳 also means leg in HK — consider).
- "More confused" = 更混亂、糊塗; "harder to stay awake" = 更難保持清醒 (companion adds 更難叫醒).
- "Warning signs" (sendNow) = 危險徵狀; check tone.
- Health number = 醫療保健號碼 (Alberta Personal Health Number).
- "I'm not sure" = 我不確定 (does not mean no).
- **Triage card (`triageInfo`):** Level names are "非常緊急 / 緊急 / 次緊急 / 非緊急"; levels 3–5 match Hong Kong Hospital Authority usage, but its level 2 is "危急", in colloquial written Cantonese. Check that "第 {{level}} 級" reads naturally. No target times are shown on purpose; please keep it that way.
- **Patient screens, 2026-11-08 (UI audit P0-2):** New draft keys: `common.retry`, `time.*`, `duration.*` (plural forms), `waitWords.*`, `patient.homeTitle`, `patient.placeInLine`, `patient.languageMissing`, `patient.companionHint`, `patient.moreOptions`, `patient.waitedLabel`, `patient.estimate*`, `patient.reportChange_companion`, `change.chooseOne`, `leaving.after`, `sent.followup_*`, `sent.queued*`, `sent.backHome`, `outbox.saved`, `exchange.intro`, `exchange.help`, `exchange.companionHint`, `exchange.expired.*`, `exchange.signedOut.helpNow`, `exchange.signedOut.scanAgain`, `privacy.seen`, `privacy.shared`, `privacy.code`, `circle.title`, `circle.notTest`, `circle.chooseCount`, `desk.*`, `flow.stopEmpty`, `flow.chooseAnswer`. Updated because the English changed: `patient.waitUnavailable`, `patient.titleCompanion`, `patient.reportChange`, `patient.signOutHelp`, `sent.stillChecking`, `message.clinician_*`, `message.leaving_info`, `exchange.askDesk`, `exchange.failed`, `exchange.takeover.*`, `exchange.signedOut.title` (no full stop now), `privacy.stored2`, `circle.confirm`, `flow.send`, `flow.finishLater`, `flow.sendNow`. Button names quoted in `desk.*` and `sent.stillChecking` copy the dock labels from the question bank, so keep them in step. Please check: Written in the same mostly standard written Chinese as the existing patient text, with 「」 quotes; "傳譯員" for interpreter; "急症室"; times may show "上晝/下晝".

- `time.dueNow` ("Due now", a staff deadline that has just arrived): added by the orchestrator when merging; check the wording.
- Companion leaving screens, 2026-11-08: new draft keys `leaving.title_companion`, `leaving.info_companion`, `leaving.confirm_companion`, `leaving.cancel_companion`, `leaving.after_companion` and `message.leaving_info_companion`. They are the companion versions of the leaving confirm and sent screens ("Is the patient leaving?") and keep the same safety advice: tell staff before going, and 911 or 811 if they get worse. Please check how the patient is referred to.
