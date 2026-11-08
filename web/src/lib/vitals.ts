import type { VitalsCreate } from '@/api/types'

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

export const emptyVitals: VitalsForm = { sbp: '', dbp: '', hr: '', rr: '', spo2: '', temp_c: '', supersedes: '' }

export type VitalsError = 'none' | 'bpPair' | 'bpOrder' | 'range'

const RANGES = { sbp: [40, 300], dbp: [20, 200], hr: [20, 250], rr: [4, 60], spo2: [50, 100] } as const

const num = (s: string): number | null | 'bad' => {
  const v = s.trim()
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : 'bad'
}

/**
 * Mirrors VitalsCreate: at least one value, sbp and dbp together with dbp below
 * sbp, and the contract's typo-catching ranges (these reject typos, not
 * abnormal values).
 */
export function validateVitals(
  form: VitalsForm,
  visitId: string,
  submissionId: string,
  measuredAt: string,
): { ok: true; body: VitalsCreate } | { ok: false; error: VitalsError } {
  const v = {
    sbp: num(form.sbp),
    dbp: num(form.dbp),
    hr: num(form.hr),
    rr: num(form.rr),
    spo2: num(form.spo2),
    temp_c: num(form.temp_c),
  }
  const values = Object.values(v)
  if (values.every((x) => x === null)) return { ok: false, error: 'none' }
  if (values.includes('bad')) return { ok: false, error: 'range' }

  for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    const x = v[key]
    const [lo, hi] = RANGES[key]
    if (typeof x === 'number' && (!Number.isInteger(x) || x < lo || x > hi)) return { ok: false, error: 'range' }
  }
  if (typeof v.temp_c === 'number' && (v.temp_c < 30 || v.temp_c > 44)) return { ok: false, error: 'range' }
  if ((v.sbp === null) !== (v.dbp === null)) return { ok: false, error: 'bpPair' }
  if (typeof v.sbp === 'number' && typeof v.dbp === 'number' && v.dbp >= v.sbp) return { ok: false, error: 'bpOrder' }

  const body: VitalsCreate = { submission_id: submissionId, visit_id: visitId, measured_at: measuredAt }
  if (typeof v.sbp === 'number') body.sbp = v.sbp
  if (typeof v.dbp === 'number') body.dbp = v.dbp
  if (typeof v.hr === 'number') body.hr = v.hr
  if (typeof v.rr === 'number') body.rr = v.rr
  if (typeof v.spo2 === 'number') body.spo2 = v.spo2
  if (typeof v.temp_c === 'number') body.temp_c = v.temp_c
  if (form.supersedes) body.supersedes = form.supersedes
  return { ok: true, body }
}
