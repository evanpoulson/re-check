// Mirrors question_bank.py: which questions are enabled for a visit and the
// answers so far. Used by the mock server and tests. Screens do NOT use this:
// they render what PatientHome.items and ReportReceipt.follow_up_items say.
import { bankItems, ext, item, section, type BankItem } from './bank'
import type { ComplaintGroup, ItemAnswer, Role } from './types'

export type AnswerValue = boolean | string | string[] | number

function conditionMet(c: NonNullable<BankItem['enableWhen']>[number], answers: Record<string, AnswerValue>): boolean {
  if (c.operator !== '=') throw new Error(`Unsupported enableWhen operator ${c.operator}`)
  const given = answers[c.question]
  if (given === undefined || given === null) return false
  if (c.answerBoolean !== undefined) return given === c.answerBoolean
  if (c.answerCoding) return Array.isArray(given) ? given.includes(c.answerCoding.code) : given === c.answerCoding.code
  if (c.answerString !== undefined) return given === c.answerString
  throw new Error(`Unsupported enableWhen answer in ${JSON.stringify(c)}`)
}

export function isEnabled(linkId: string, answers: Record<string, AnswerValue>): boolean {
  const i = bankItems.get(linkId)
  if (!i) throw new Error(`Question bank has no item "${linkId}"`)
  const conditions = i.enableWhen ?? []
  if (conditions.length === 0) return true
  const results = conditions.map((c) => conditionMet(c, answers))
  if (results.length === 1) return results[0]!
  return i.enableBehavior === 'any' ? results.some(Boolean) : results.every(Boolean)
}

/** Base check-in questions for whoever is answering. Pain and the circle check are patient only. */
export const baseItems = (reporter: Role): string[] =>
  section('base').filter((k) => isEnabled(k, { answerer: reporter }))

/**
 * Follow-ups enabled by the visit and the answers so far. Returns [ask now, ask
 * after routing]; items marked ask-after-routing are offered only once any
 * urgent finding has been routed.
 */
export function followUps(
  group: ComplaintGroup,
  cedisCode: string | null,
  answers: Record<string, AnswerValue>,
): [string[], string[]] {
  const merged: Record<string, AnswerValue> = { ...answers, complaint_group: group }
  if (cedisCode) merged.cedis_code = cedisCode
  const now: string[] = []
  const later: string[] = []
  for (const key of section('follow_up')) {
    if (!isEnabled(key, merged)) continue
    ;(ext<boolean>(item(key), 'ask-after-routing') ? later : now).push(key)
  }
  return [now, later]
}

/** Raw values for branching. A missing answer is left out, so "not sure" never opens a follow-up. */
export function rawAnswers(items: Record<string, ItemAnswer>): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {}
  for (const [k, a] of Object.entries(items)) if (a.kind !== 'missing') out[k] = a.value
  return out
}
