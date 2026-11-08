import type { TFunction } from 'i18next'
import type { VisitSummary } from '@/api/types'
import { clock } from './time'

/** "Patient signed in since 14:05", "Companion signed in since …" or "No one signed in". */
export function signedInText(visit: Pick<VisitSummary, 'signed_in_as' | 'signed_in_since'>, t: TFunction): string {
  if (!visit.signed_in_as || !visit.signed_in_since) return t('signedIn.none')
  return t(`signedIn.${visit.signed_in_as}`, { time: clock(visit.signed_in_since) })
}
