import type { AttentionPrompt, CheckinReport, FeelingChange, FeelingNow, FindingCode, ItemAnswer, MissingReason, Role } from '@/api/types'

/** What happened in the circle-counting check. `undefined` means the patient never reached it. */
export interface AttentionDraft {
  /** The circles were shown. Only then does the report name the prompt. */
  shown: boolean
  count?: number
  /** "I'm not sure" or "I can't do this". */
  skip?: 'unsure' | 'unable_to_respond'
}

/** What the person has entered so far. `undefined` means they never reached that question. */
export interface CheckinDraft {
  feelingNow?: FeelingNow | 'unsure'
  feelingChange?: FeelingChange | 'unsure'
  pain?: number | 'unsure'
  /** An empty list means "none of these". */
  findings?: FindingCode[] | 'unsure'
  attention?: AttentionDraft
  items: Record<string, ItemAnswer | undefined>
}

type Missing = { kind: 'missing'; reason: MissingReason }
const missing = (reason: MissingReason): Missing => ({ kind: 'missing', reason })

interface Args {
  draft: CheckinDraft
  /** Who is answering. This is the report's `reporter`. */
  reporter: Role
  version: string
  submissionId: string
  capturedAt: string
  /** Every item key the visit's question bank asks. */
  itemKeys: string[]
  /** The circle prompt the server issued, or null when none was offered. */
  prompt: Pick<AttentionPrompt, 'prompt_id'> | null
  /**
   * `full` is a scheduled check-in. `followup` answers only the items an urgent
   * finding asked for, so the fixed questions are reported as `not_asked`.
   */
  mode?: 'full' | 'followup'
}

function attentionAnswer(a: Args): CheckinReport['attention'] {
  // The circle check belongs to the patient. A companion, a follow-up, or a visit
  // with no prompt offered never names a prompt, so it is not a missed check.
  if (a.reporter === 'companion' || a.mode === 'followup' || !a.prompt) return missing('not_asked')

  const d = a.draft.attention
  const prompt_id = a.prompt.prompt_id
  if (!d?.shown) return missing('not_reached') // never shown, so no prompt id
  if (d.count !== undefined) return { kind: 'answered', prompt_id, count: d.count }
  // Shown but not answered: name the prompt so staff can tell this from "never shown".
  if (d.skip) return { kind: 'missing', reason: d.skip, prompt_id }
  return { kind: 'missing', reason: 'not_reached', prompt_id }
}

/**
 * Build a check-in report. Every answer is a value or an explicit missing
 * reason, so "no", "not sure", "never reached" and "not asked" stay distinct.
 * A partial check-in is valid: unreached questions become `not_reached`.
 */
export function buildCheckinReport(args: Args): CheckinReport {
  const { draft, reporter, version, submissionId, capturedAt, itemKeys, mode = 'full' } = args
  const unanswered: MissingReason = mode === 'full' ? 'not_reached' : 'not_asked'

  const feeling_now: CheckinReport['feeling_now'] =
    draft.feelingNow === undefined ? missing(unanswered) : draft.feelingNow === 'unsure' ? missing('unsure') : { kind: 'answered', value: draft.feelingNow }

  const feeling_change: CheckinReport['feeling_change'] =
    draft.feelingChange === undefined
      ? missing(unanswered)
      : draft.feelingChange === 'unsure'
        ? missing('unsure')
        : { kind: 'answered', value: draft.feelingChange }

  // Pain is self-reported. A companion always sends it as missing.
  const pain: CheckinReport['pain'] =
    reporter === 'companion' || mode === 'followup'
      ? missing('not_asked')
      : draft.pain === undefined
        ? missing(unanswered)
        : draft.pain === 'unsure'
          ? missing('unsure')
          : { kind: 'answered', value: draft.pain }

  const new_findings: CheckinReport['new_findings'] =
    draft.findings === undefined ? missing(unanswered) : draft.findings === 'unsure' ? missing('unsure') : { kind: 'answered', value: draft.findings }

  const keys = mode === 'full' ? itemKeys : itemKeys.filter((k) => draft.items[k] !== undefined)
  const items: NonNullable<CheckinReport['items']> = {}
  for (const key of keys) items[key] = draft.items[key] ?? missing('not_reached')

  return {
    kind: 'checkin',
    submission_id: submissionId,
    reporter,
    channel: 'phone',
    captured_at: capturedAt,
    questionnaire_version: version,
    feeling_now,
    feeling_change,
    pain,
    new_findings,
    attention: attentionAnswer(args),
    items,
  }
}
