import type { TFunction } from 'i18next'
import { optionLabel, text } from '@/api/bank'
import type { CheckinReport, ItemAnswer, MissingReason } from '@/api/types'

type Answered = { kind: 'answered'; value: string }
type Missing = { kind: 'missing'; reason: MissingReason }

/** A choice answer as text from the bank, or the missing reason. "Not sure" is never shown as "no". */
export function choiceText(a: Answered | Missing, linkId: string, t: TFunction): string {
  return a.kind === 'answered' ? optionLabel(linkId, a.value) : t(`missing.${a.reason}`)
}

export function painText(a: CheckinReport['pain'], t: TFunction): string {
  return a.kind === 'answered' ? String(a.value) : t(`missing.${a.reason}`)
}

export function findingsText(a: CheckinReport['new_findings'], t: TFunction): string {
  if (a.kind === 'missing') return t(`missing.${a.reason}`)
  return a.value.length ? a.value.map((f) => optionLabel('new_findings', f)).join(', ') : t('timeline.noFindings')
}

/**
 * What the patient did on the circle check. The UI shows what happened, not a
 * verdict: whether a count is right is the server's call. "Shown but not
 * answered" and "not shown" stay distinct.
 */
export function attentionText(a: CheckinReport['attention'], t: TFunction): string {
  if (a.kind === 'answered') return t('attention.answered', { count: a.count })
  if (a.prompt_id) return t('attention.shownNotAnswered', { reason: t(`missing.${a.reason}`) })
  return t('attention.notShown')
}

export function itemAnswerText(a: ItemAnswer, t: TFunction): string {
  switch (a.kind) {
    case 'missing':
      return t(`missing.${a.reason}`)
    case 'yes_no':
      return a.value ? t('common.yes') : t('common.no')
    case 'multi_choice':
      return a.value.join(', ') || t('timeline.noFindings')
    default:
      return String(a.value)
  }
}

/** The button wording for a concern code, from the bank. */
export const concernText = (code: string): string => text(code, 'patient')
