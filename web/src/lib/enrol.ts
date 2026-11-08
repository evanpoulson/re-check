import type { ComplaintGroup, Language, VisitCreate } from '@/api/types'

export interface EnrolForm {
  ctas: number | null
  complaint_group: ComplaintGroup
  cedis_code: string
  language: Language
  channel: 'phone' | 'pager'
  pager_no: string
}

export type EnrolErrors = Partial<Record<'ctas' | 'cedis_code' | 'pager_no', string>>

export const emptyEnrol: EnrolForm = {
  ctas: null,
  complaint_group: 'general',
  cedis_code: '',
  language: 'en',
  channel: 'phone',
  pager_no: '',
}

/** Mirrors the contract's VisitCreate rules so the nurse sees errors before the request. */
export function validateEnrol(
  form: EnrolForm,
  submissionId: string,
): { ok: true; body: VisitCreate } | { ok: false; errors: EnrolErrors } {
  const errors: EnrolErrors = {}
  if (form.ctas === null || !Number.isInteger(form.ctas) || form.ctas < 2 || form.ctas > 5) {
    errors.ctas = 'ctas'
  }
  const cedis = form.cedis_code.trim()
  if (cedis && !/^[0-9]{3}$/.test(cedis)) errors.cedis_code = 'cedis'
  const pager = form.pager_no.trim()
  if (form.channel === 'pager' && !/^[0-9]{1,6}$/.test(pager)) errors.pager_no = 'pagerRequired'
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const body: VisitCreate = {
    submission_id: submissionId,
    ctas: form.ctas as number,
    complaint_group: form.complaint_group,
    language: form.language,
    channel: form.channel,
  }
  if (cedis) body.cedis_code = cedis
  if (form.channel === 'pager') body.pager_no = pager
  return { ok: true, body }
}
