import type { TFunction } from 'i18next'
import type { VitalsCreate, VitalsRecord } from '@/api/types'

export interface VitalsForm {
  sbp: string
  dbp: string
  hr: string
  rr: string
  spo2: string
  temp_c: string
  /** Id of an earlier vitals record this one corrects, or empty. */
  supersedes: string
}

export type VitalsField = keyof Omit<VitalsForm, 'supersedes'>

export const emptyVitals: VitalsForm = { sbp: '', dbp: '', hr: '', rr: '', spo2: '', temp_c: '', supersedes: '' }

/** `none` is about the whole form; the rest belong to one field. */
export type VitalsFieldError = 'bpPair' | 'bpOrder' | 'range'
export type VitalsErrors = { none?: true } & Partial<Record<VitalsField, VitalsFieldError>>

/** The contract's typo-catching ranges. Temperature allows decimals; the rest are whole numbers. */
export const VITALS_RANGES: Record<VitalsField, readonly [number, number]> = {
  sbp: [40, 300],
  dbp: [20, 200],
  hr: [20, 250],
  rr: [4, 60],
  spo2: [50, 100],
  temp_c: [30, 44],
}
const FIELDS = Object.keys(VITALS_RANGES) as VitalsField[]

const num = (s: string): number | null | 'bad' => {
  const v = s.trim()
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : 'bad'
}

/**
 * Mirrors VitalsCreate: at least one value, sbp and dbp together with dbp below
 * sbp, and the contract's typo-catching ranges (these reject typos, not
 * abnormal values). Every field with a problem gets its own error.
 */
export function validateVitals(
  form: VitalsForm,
  visitId: string,
  submissionId: string,
  measuredAt: string,
): { ok: true; body: VitalsCreate } | { ok: false; errors: VitalsErrors } {
  const v = Object.fromEntries(FIELDS.map((f) => [f, num(form[f])])) as Record<VitalsField, number | null | 'bad'>
  if (FIELDS.every((f) => v[f] === null)) return { ok: false, errors: { none: true } }

  const errors: VitalsErrors = {}
  for (const f of FIELDS) {
    const x = v[f]
    const [lo, hi] = VITALS_RANGES[f]
    if (x === 'bad' || (typeof x === 'number' && ((f !== 'temp_c' && !Number.isInteger(x)) || x < lo || x > hi))) errors[f] = 'range'
  }
  if (!errors.sbp && !errors.dbp) {
    if (v.sbp === null && v.dbp !== null) errors.sbp = 'bpPair'
    else if (v.dbp === null && v.sbp !== null) errors.dbp = 'bpPair'
    else if (typeof v.sbp === 'number' && typeof v.dbp === 'number' && v.dbp >= v.sbp) errors.dbp = 'bpOrder'
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const body: VitalsCreate = { submission_id: submissionId, visit_id: visitId, measured_at: measuredAt }
  for (const f of FIELDS) {
    const x = v[f]
    if (typeof x === 'number') body[f] = x
  }
  if (form.supersedes) body.supersedes = form.supersedes
  return { ok: true, body }
}

/** "BP 150/90 mmHg, HR 110 beats/min, …", with units, for the timeline and saved-vitals lists. */
export function vitalsText(v: Pick<VitalsRecord, VitalsField>, t: TFunction): string {
  return [
    v.sbp !== null && v.dbp !== null ? t('vitals.short.bp', { sbp: v.sbp, dbp: v.dbp }) : null,
    v.hr !== null ? t('vitals.short.hr', { value: v.hr }) : null,
    v.rr !== null ? t('vitals.short.rr', { value: v.rr }) : null,
    v.spo2 !== null ? t('vitals.short.spo2', { value: v.spo2 }) : null,
    v.temp_c !== null ? t('vitals.short.temp_c', { value: v.temp_c }) : null,
  ].filter(Boolean).join(', ')
}
