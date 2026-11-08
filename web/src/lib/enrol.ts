import { checkEnrolment } from '@/api/cedis'
import type { AppExclusion, ComplaintGroup, Language, VisitCreate } from '@/api/types'

export interface EnrolForm {
  ctas: number | null
  complaint_group: ComplaintGroup
  cedis_code: string
  language: Language
  /** Set when the patient app is not offered. Then there is no channel, pager or QR. */
  app_exclusion: AppExclusion | null
  channel: 'phone' | 'pager'
  pager_no: string
}

export type EnrolErrors = Partial<Record<'ctas' | 'cedis_code' | 'pager_no' | 'app_exclusion', string>> & {
  /** The backend's own message when the CEDIS map contradicts the nurse's choices. */
  conflict?: string
}

export const emptyEnrol: EnrolForm = {
  ctas: 2,
  complaint_group: 'general',
  cedis_code: '',
  language: 'en',
  app_exclusion: null,
  channel: 'phone',
  pager_no: '',
}

/**
 * Mirrors VisitCreate and check_enrolment() so the nurse sees errors before the
 * request: CTAS 2 to 5; a 3-digit CEDIS code; a channel (and a pager number for
 * pager) unless the app is not offered, in which case there must be none; and a
 * group or exclusion that agrees with the CEDIS map.
 */
export function validateEnrol(
  form: EnrolForm,
  submissionId: string,
): { ok: true; body: VisitCreate } | { ok: false; errors: EnrolErrors } {
  const errors: EnrolErrors = {}
  if (form.ctas === null || !Number.isInteger(form.ctas) || form.ctas < 2 || form.ctas > 5) errors.ctas = 'ctas'

  const cedis = form.cedis_code.trim()
  if (cedis && !/^[0-9]{3}$/.test(cedis)) errors.cedis_code = 'cedis'

  const offered = form.app_exclusion === null
  const pager = form.pager_no.trim()
  if (offered && form.channel === 'pager' && !/^[0-9]{1,6}$/.test(pager)) errors.pager_no = 'pagerRequired'

  if (!errors.cedis_code) {
    const conflict = checkEnrolment({ cedis_code: cedis || null, complaint_group: form.complaint_group, app_exclusion: form.app_exclusion })
    if (conflict) errors.conflict = conflict.message
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const body: VisitCreate = {
    submission_id: submissionId,
    ctas: form.ctas as number,
    complaint_group: form.complaint_group,
    language: form.language,
  }
  if (cedis) body.cedis_code = cedis
  if (form.app_exclusion) {
    body.app_exclusion = form.app_exclusion
  } else {
    body.channel = form.channel
    if (form.channel === 'pager') body.pager_no = pager
  }
  return { ok: true, body }
}
