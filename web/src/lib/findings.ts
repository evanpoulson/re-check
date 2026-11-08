import type { FindingCode } from '@/api/types'

/**
 * Warning signs that are urgent on their own: specific, observable and time
 * critical (stroke signs, breathing, collapse, bleeding, new confusion). The
 * others are common in a waiting room and often reported with other worries, so
 * one alone asks for a review, and two together, or one with "much worse", are
 * urgent. Mirrors URGENT_FINDINGS in api/src/recheck/rules.py. Demo values for
 * clinical review.
 */
export const URGENT_FINDINGS: readonly FindingCode[] = [
  'speech_change',
  'facial_droop',
  'new_weakness_numbness',
  'trouble_breathing',
  'fainting',
  'heavy_bleeding',
  'new_confusion',
  'chest_pain',
]

export const isUrgentFinding = (code: FindingCode) => URGENT_FINDINGS.includes(code)
