import { describe, expect, it } from 'vitest'
import { emptyEnrol, validateEnrol } from './enrol'

const id = '11111111-1111-4111-8111-111111111111'

describe('validateEnrol (mirrors VisitCreate)', () => {
  it('requires a CTAS level from 2 to 5', () => {
    expect(validateEnrol(emptyEnrol, id)).toMatchObject({ ok: false, errors: { ctas: 'ctas' } })
    expect(validateEnrol({ ...emptyEnrol, ctas: 1 }, id).ok).toBe(false)
    expect(validateEnrol({ ...emptyEnrol, ctas: 6 }, id).ok).toBe(false)
    expect(validateEnrol({ ...emptyEnrol, ctas: 2 }, id).ok).toBe(true)
  })

  it('needs a pager number only for the pager channel', () => {
    expect(validateEnrol({ ...emptyEnrol, ctas: 3, channel: 'pager' }, id)).toMatchObject({
      ok: false,
      errors: { pager_no: 'pagerRequired' },
    })
    expect(validateEnrol({ ...emptyEnrol, ctas: 3, channel: 'pager', pager_no: '1234567' }, id).ok).toBe(false)
    const ok = validateEnrol({ ...emptyEnrol, ctas: 3, channel: 'pager', pager_no: '42' }, id)
    expect(ok.ok && ok.body.pager_no).toBe('42')
  })

  it('never sends a pager number for the phone channel', () => {
    const r = validateEnrol({ ...emptyEnrol, ctas: 3, channel: 'phone', pager_no: '42' }, id)
    expect(r.ok && 'pager_no' in r.body).toBe(false)
  })

  it('CEDIS is optional but exactly three digits', () => {
    expect(validateEnrol({ ...emptyEnrol, ctas: 3, cedis_code: '12' }, id).ok).toBe(false)
    const r = validateEnrol({ ...emptyEnrol, ctas: 3, cedis_code: '123' }, id)
    expect(r.ok && r.body.cedis_code).toBe('123')
    const none = validateEnrol({ ...emptyEnrol, ctas: 3 }, id)
    expect(none.ok && 'cedis_code' in none.body).toBe(false)
  })

  it('carries the client submission id', () => {
    const r = validateEnrol({ ...emptyEnrol, ctas: 4 }, id)
    expect(r.ok && r.body.submission_id).toBe(id)
  })
})
