import { describe, expect, it } from 'vitest'
import { emptyEnrol, matchCedis, validateEnrol } from './enrol'

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

  describe('when the app is not offered', () => {
    const excluded = { ...emptyEnrol, ctas: 4, app_exclusion: 'child' as const }

    it('sends the reason and no channel or pager, even if they were filled in', () => {
      const r = validateEnrol({ ...excluded, channel: 'pager', pager_no: '42' }, id)
      expect(r.ok && r.body.app_exclusion).toBe('child')
      expect(r.ok && 'channel' in r.body).toBe(false)
      expect(r.ok && 'pager_no' in r.body).toBe(false)
    })

    it('does not need a pager number', () => {
      expect(validateEnrol({ ...excluded, channel: 'pager', pager_no: '' }, id).ok).toBe(true)
    })
  })

  describe('CEDIS rules from the backend map (check_enrolment)', () => {
    it('rejects the app for an excluded complaint', () => {
      const r = validateEnrol({ ...emptyEnrol, ctas: 3, cedis_code: '351' }, id)
      expect(r).toMatchObject({ ok: false, errors: { conflict: expect.stringContaining('exclusion') } })
    })

    it('accepts an excluded complaint once an exclusion is set', () => {
      expect(validateEnrol({ ...emptyEnrol, ctas: 3, cedis_code: '351', app_exclusion: 'self_harm_or_violence' }, id).ok).toBe(true)
    })

    it('rejects the wrong group for a mapped code', () => {
      const r = validateEnrol({ ...emptyEnrol, ctas: 3, cedis_code: '402', complaint_group: 'general' }, id)
      expect(r).toMatchObject({ ok: false, errors: { conflict: expect.stringContaining('confused_drowsy') } })
      expect(validateEnrol({ ...emptyEnrol, ctas: 3, cedis_code: '402', complaint_group: 'confused_drowsy' }, id).ok).toBe(true)
    })

    it('leaves the group to the nurse for an unlisted code', () => {
      expect(validateEnrol({ ...emptyEnrol, ctas: 3, cedis_code: '704', complaint_group: 'head_injury' }, id).ok).toBe(true)
    })
  })

  it('carries the client submission id', () => {
    const r = validateEnrol({ ...emptyEnrol, ctas: 4 }, id)
    expect(r.ok && r.body.submission_id).toBe(id)
  })

  it('finds CEDIS codes by code prefix or by name', () => {
    expect(matchCedis('').length).toBeGreaterThan(20)
    expect(matchCedis('4').every((e) => e.code.startsWith('4'))).toBe(true)
    const byName = matchCedis(matchCedis('')[0]!.name.slice(0, 5).toLowerCase())
    expect(byName.length).toBeGreaterThan(0)
    expect(matchCedis('zzzz')).toEqual([])
  })
})
