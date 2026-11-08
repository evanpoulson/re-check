# zh (Simplified Chinese, Mandarin) — items for medical translator review

- Register: 您 throughout.
- Companion wording refers to the patient as 病人 (gender-neutral; avoids 他/她). `worried` companion = 我担心病人的情况在变差.
- "Check-in" (the periodic prompt) = 状况回报; "checked in" (registration) = 已完成登记. Confirm these read naturally and are not confused with a medical exam (检查).
- Seizure (fit) = 抽搐（癫痫发作）. Avoided 抽筋, which usually means muscle cramp.
- "More confused / muddled" = 更糊涂、头脑更不清楚 — confirm it conveys new confusion, not forgetfulness.
- "Harder to stay awake" = 更难保持清醒; companion adds 更难叫醒 (harder to wake).
- "Warning signs" (sendNow) = 危险症状 — stronger than 警示症状; check tone.
- Health number = 医保卡号码 (Alberta Personal Health Number); confirm local usage.
- "Triage" = 分诊台 (desk/location). "Clinician" = 医护人员 (doctor or nurse practitioner), not 医生 only.
- "Code" in exchange screens rendered as QR码 for clarity.
- "I'm not sure" = 我不确定 (does not mean no).
- **Triage card (`triageInfo`):** Level names: "非常紧急 / 紧急 / 次紧急 / 非紧急", with "第 {{level}} 级". Check them against mainland triage usage. No target times are shown on purpose; please keep it that way.
- **Patient screens, 2026-11-08 (UI audit P0-2):** New draft keys: `common.retry`, `time.*`, `duration.*` (plural forms), `waitWords.*`, `patient.homeTitle`, `patient.placeInLine`, `patient.languageMissing`, `patient.companionHint`, `patient.moreOptions`, `patient.waitedLabel`, `patient.estimate*`, `patient.reportChange_companion`, `change.chooseOne`, `leaving.after`, `sent.followup_*`, `sent.queued*`, `sent.backHome`, `outbox.saved`, `exchange.intro`, `exchange.help`, `exchange.companionHint`, `exchange.expired.*`, `exchange.signedOut.helpNow`, `exchange.signedOut.scanAgain`, `privacy.seen`, `privacy.shared`, `privacy.code`, `circle.title`, `circle.notTest`, `circle.chooseCount`, `desk.*`, `flow.stopEmpty`, `flow.chooseAnswer`. Updated because the English changed: `patient.waitUnavailable`, `patient.titleCompanion`, `patient.reportChange`, `patient.signOutHelp`, `sent.stillChecking`, `message.clinician_*`, `message.leaving_info`, `exchange.askDesk`, `exchange.failed`, `exchange.takeover.*`, `exchange.signedOut.title` (no full stop now), `privacy.stored2`, `circle.confirm`, `flow.send`, `flow.finishLater`, `flow.sendNow`. Button names quoted in `desk.*` and `sent.stillChecking` copy the dock labels from the question bank, so keep them in step. Please check: "QR码" kept as in the existing text; "口译员" for interpreter; "AHS 估计" left with the acronym; "现在就可以" for "Ready now".
