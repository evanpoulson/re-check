import type { CheckinReport, FindingCode, ItemAnswer, MissingReason, Overall, Role } from '@/api/types'

/** What the person has entered so far. `undefined` means they never reached that question. */
export interface CheckinDraft {
  overall?: Overall | 'unsure'
  pain?: number | 'unsure'
  /** An empty list means "none of these". */
  findings?: FindingCode[] | 'unsure'
  items: Record<string, ItemAnswer | undefined>
}

type Missing = { kind: 'missing'; reason: MissingReason }
const missing = (reason: MissingReason): Missing => ({ kind: 'missing', reason })

interface Args {
  draft: CheckinDraft
  role: Role
  version: string
  submissionId: string
  capturedAt: string
  /** Every item key the visit's question bank asks. */
  itemKeys: string[]
  /**
   * `full` is a scheduled check-in. `followup` answers only the items an urgent
   * finding asked for, so the fixed questions are reported as `not_asked`.
   */
  mode?: 'full' | 'followup'
}

/**
 * Build a check-in report. Every answer is a value or an explicit missing
 * reason, so "no", "not sure", "never reached" and "not asked" stay distinct.
 * A partial check-in is valid: unreached questions become `not_reached`.
 */
export function buildCheckinReport({ draft, role, version, submissionId, capturedAt, itemKeys, mode = 'full' }: Args): CheckinReport {
  const unanswered: MissingReason = mode === 'full' ? 'not_reached' : 'not_asked'

  const overall: CheckinReport['overall'] =
    draft.overall === undefined
      ? missing(unanswered)
      : draft.overall === 'unsure'
        ? missing('unsure')
        : { kind: 'answered', value: draft.overall }

  // Pain is self-reported. A companion always sends it as missing.
  const pain: CheckinReport['pain'] =
    role === 'companion'
      ? missing('not_asked')
      : draft.pain === undefined
        ? missing(unanswered)
        : draft.pain === 'unsure'
          ? missing('unsure')
          : { kind: 'answered', value: draft.pain }

  const new_findings: CheckinReport['new_findings'] =
    draft.findings === undefined
      ? missing(unanswered)
      : draft.findings === 'unsure'
        ? missing('unsure')
        : { kind: 'answered', value: draft.findings }

  const keys = mode === 'full' ? itemKeys : itemKeys.filter((k) => draft.items[k] !== undefined)
  const items: NonNullable<CheckinReport['items']> = {}
  for (const key of keys) items[key] = draft.items[key] ?? missing('not_reached')

  return {
    kind: 'checkin',
    submission_id: submissionId,
    reporter: role,
    channel: 'phone',
    captured_at: capturedAt,
    questionnaire_version: version,
    overall,
    pain,
    new_findings,
    items,
  }
}
