import { describe, expect, it } from 'vitest'
import { cedisEntries, checkEnrolment, exclusionForCedis, groupForCedis, lookupCedis } from './cedis'

// Ported from api/tests/question_bank/test_question_bank.py.
describe('CEDIS map', () => {
  it.each([
    ['003', 'chest_back_pain'],
    ['551', 'chest_back_pain'],
    ['403', 'neuro_change'],
    ['404', 'neuro_change'],
    ['407', 'head_injury'],
    ['402', 'confused_drowsy'],
    ['854', 'confused_drowsy'],
    ['251', 'general'],
    ['999', 'general'],
    [null, 'general'],
  ])('code %s selects %s', (code, group) => {
    expect(groupForCedis(code)).toBe(group)
  })

  it.each([
    ['458', 'pregnancy_over_20_weeks'],
    ['351', 'self_harm_or_violence'],
    ['355', 'self_harm_or_violence'],
    ['801', 'major_trauma'],
    ['609', 'child'],
    ['003', null],
    [null, null],
  ])('code %s suggests exclusion %s', (code, exclusion) => {
    expect(exclusionForCedis(code)).toBe(exclusion)
  })

  it('lists named entries and never groups and excludes the same code', () => {
    expect(cedisEntries.length).toBeGreaterThan(20)
    expect(lookupCedis('402')?.name).toMatch(/onfusion/)
    expect(cedisEntries.every((e) => !(e.group && e.exclusion))).toBe(true)
    expect(new Set(cedisEntries.map((e) => e.exclusion).filter(Boolean)).size).toBe(4)
  })
})

describe('checkEnrolment (mirrors check_enrolment)', () => {
  const v = (cedis_code: string | null, complaint_group: Parameters<typeof checkEnrolment>[0]['complaint_group'], app_exclusion: Parameters<typeof checkEnrolment>[0]['app_exclusion'] = null) => ({ cedis_code, complaint_group, app_exclusion })

  it('accepts choices that match the map', () => {
    expect(checkEnrolment(v('402', 'confused_drowsy'))).toBeNull()
    expect(checkEnrolment(v('458', 'general', 'child'))).toBeNull()
  })

  it('leaves the group to the nurse for unlisted codes, and allows any exclusion', () => {
    expect(checkEnrolment(v('704', 'head_injury'))).toBeNull()
    expect(checkEnrolment(v('003', 'chest_back_pain', 'child'))).toBeNull()
  })

  it('rejects an app for an excluded complaint', () => {
    expect(checkEnrolment(v('351', 'general'))).toMatchObject({ kind: 'exclusion', message: expect.stringContaining('exclusion') })
  })

  it('rejects the wrong group', () => {
    expect(checkEnrolment(v('402', 'general'))).toMatchObject({ kind: 'group', mapped: 'confused_drowsy', message: expect.stringContaining('confused_drowsy') })
  })

  it('has nothing to say without a code', () => {
    expect(checkEnrolment(v(null, 'general'))).toBeNull()
  })
})
