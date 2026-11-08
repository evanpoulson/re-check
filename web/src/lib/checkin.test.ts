import { describe, expect, it } from 'vitest'
import { buildCheckinReport } from './checkin'

const base = {
  version: '2026-11-07.demo',
  submissionId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-11-07T18:00:00.000Z',
  itemKeys: ['pain_change', 'pain_spread'],
}

describe('buildCheckinReport', () => {
  it('sends answered values', () => {
    const r = buildCheckinReport({
      ...base,
      role: 'patient',
      draft: {
        overall: 'worse',
        pain: 7,
        findings: ['chest_pain'],
        items: { pain_change: { kind: 'yes_no', value: true }, pain_spread: { kind: 'yes_no', value: false } },
      },
    })
    expect(r.overall).toEqual({ kind: 'answered', value: 'worse' })
    expect(r.pain).toEqual({ kind: 'answered', value: 7 })
    expect(r.new_findings).toEqual({ kind: 'answered', value: ['chest_pain'] })
    expect(r.items?.pain_spread).toEqual({ kind: 'yes_no', value: false })
    expect(r.channel).toBe('phone')
    expect(r.reporter).toBe('patient')
  })

  it('keeps "not sure" distinct from "no" and from "never reached"', () => {
    const r = buildCheckinReport({
      ...base,
      role: 'patient',
      draft: { overall: 'unsure', findings: [], items: { pain_change: { kind: 'missing', reason: 'unsure' } } },
    })
    expect(r.overall).toEqual({ kind: 'missing', reason: 'unsure' })
    expect(r.new_findings).toEqual({ kind: 'answered', value: [] }) // "none of these" is an answer
    expect(r.pain).toEqual({ kind: 'missing', reason: 'not_reached' })
    expect(r.items?.pain_change).toEqual({ kind: 'missing', reason: 'unsure' })
    expect(r.items?.pain_spread).toEqual({ kind: 'missing', reason: 'not_reached' })
  })

  it('a partial check-in marks every unreached question not_reached', () => {
    const r = buildCheckinReport({ ...base, role: 'patient', draft: { overall: 'same', items: {} } })
    expect(r.pain).toEqual({ kind: 'missing', reason: 'not_reached' })
    expect(r.new_findings).toEqual({ kind: 'missing', reason: 'not_reached' })
    expect(Object.values(r.items ?? {}).every((a) => a.kind === 'missing' && a.reason === 'not_reached')).toBe(true)
  })

  it('a companion never sends pain, even if the draft has one', () => {
    const r = buildCheckinReport({ ...base, role: 'companion', draft: { overall: 'worse', pain: 9, findings: [], items: {} } })
    expect(r.reporter).toBe('companion')
    expect(r.pain.kind).toBe('missing')
  })

  it('a follow-up reports only the items asked, and the fixed questions as not_asked', () => {
    const r = buildCheckinReport({
      ...base,
      role: 'patient',
      mode: 'followup',
      itemKeys: ['pain_location'],
      draft: { items: { pain_location: { kind: 'choice', value: 'arm' } } },
    })
    expect(r.overall).toEqual({ kind: 'missing', reason: 'not_asked' })
    expect(r.new_findings).toEqual({ kind: 'missing', reason: 'not_asked' })
    expect(Object.keys(r.items ?? {})).toEqual(['pain_location'])
  })
})
