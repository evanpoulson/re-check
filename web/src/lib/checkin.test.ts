import { describe, expect, it } from 'vitest'
import { buildCheckinReport } from './checkin'

const prompt = { prompt_id: '22222222-2222-4222-8222-222222222222' }
const base = {
  version: '2026-11-07.1',
  submissionId: '11111111-1111-4111-8111-111111111111',
  capturedAt: '2026-11-07T18:00:00.000Z',
  itemKeys: ['pain_moved', 'pain_sudden_worse'],
  prompt,
}

describe('buildCheckinReport', () => {
  it('sends answered values, including the wellness questions and the circle count', () => {
    const r = buildCheckinReport({
      ...base,
      reporter: 'patient',
      draft: {
        feelingNow: 'poor',
        feelingChange: 'worse',
        pain: 7,
        findings: ['chest_pain'],
        attention: { shown: true, count: 5 },
        items: { pain_moved: { kind: 'yes_no', value: true }, pain_sudden_worse: { kind: 'yes_no', value: false } },
      },
    })
    expect(r.feeling_now).toEqual({ kind: 'answered', value: 'poor' })
    expect(r.feeling_change).toEqual({ kind: 'answered', value: 'worse' })
    expect(r.pain).toEqual({ kind: 'answered', value: 7 })
    expect(r.new_findings).toEqual({ kind: 'answered', value: ['chest_pain'] })
    expect(r.attention).toEqual({ kind: 'answered', prompt_id: prompt.prompt_id, count: 5 })
    expect(r.items?.pain_sudden_worse).toEqual({ kind: 'yes_no', value: false })
    expect(r.channel).toBe('phone')
    expect(r.reporter).toBe('patient')
  })

  it('keeps "not sure" distinct from "no" and from "never reached"', () => {
    const r = buildCheckinReport({
      ...base,
      reporter: 'patient',
      draft: { feelingNow: 'unsure', findings: [], items: { pain_moved: { kind: 'missing', reason: 'unsure' } } },
    })
    expect(r.feeling_now).toEqual({ kind: 'missing', reason: 'unsure' })
    expect(r.new_findings).toEqual({ kind: 'answered', value: [] }) // "none of these" is an answer
    expect(r.feeling_change).toEqual({ kind: 'missing', reason: 'not_reached' })
    expect(r.items?.pain_moved).toEqual({ kind: 'missing', reason: 'unsure' })
    expect(r.items?.pain_sudden_worse).toEqual({ kind: 'missing', reason: 'not_reached' })
  })

  it('a partial check-in marks every unreached question not_reached, and the circle check never shown names no prompt', () => {
    const r = buildCheckinReport({ ...base, reporter: 'patient', draft: { feelingNow: 'ok', items: {} } })
    expect(r.pain).toEqual({ kind: 'missing', reason: 'not_reached' })
    expect(r.new_findings).toEqual({ kind: 'missing', reason: 'not_reached' })
    expect(r.attention).toEqual({ kind: 'missing', reason: 'not_reached' })
    expect('prompt_id' in r.attention).toBe(false)
  })

  describe('the circle check', () => {
    const draft = (attention: Parameters<typeof buildCheckinReport>[0]['draft']['attention']) => ({ items: {}, attention })

    it('"I can\'t do this" is shown but not answered: missing, unable_to_respond, with the prompt id', () => {
      const r = buildCheckinReport({ ...base, reporter: 'patient', draft: draft({ shown: true, skip: 'unable_to_respond' }) })
      expect(r.attention).toEqual({ kind: 'missing', reason: 'unable_to_respond', prompt_id: prompt.prompt_id })
    })

    it('"I\'m not sure" is shown but not answered: missing, unsure, with the prompt id', () => {
      const r = buildCheckinReport({ ...base, reporter: 'patient', draft: draft({ shown: true, skip: 'unsure' }) })
      expect(r.attention).toEqual({ kind: 'missing', reason: 'unsure', prompt_id: prompt.prompt_id })
    })

    it('leaving after the circles were shown but before counting names the prompt', () => {
      const r = buildCheckinReport({ ...base, reporter: 'patient', draft: draft({ shown: true }) })
      expect(r.attention).toEqual({ kind: 'missing', reason: 'not_reached', prompt_id: prompt.prompt_id })
    })

    it('a count of zero is an answer, not a missing value', () => {
      const r = buildCheckinReport({ ...base, reporter: 'patient', draft: draft({ shown: true, count: 0 }) })
      expect(r.attention).toEqual({ kind: 'answered', prompt_id: prompt.prompt_id, count: 0 })
    })

    it('no prompt offered is not asked, with no prompt id', () => {
      const r = buildCheckinReport({ ...base, prompt: null, reporter: 'patient', draft: draft(undefined) })
      expect(r.attention).toEqual({ kind: 'missing', reason: 'not_asked' })
    })
  })

  describe('a companion', () => {
    it('never sends pain, even if the draft has one', () => {
      const r = buildCheckinReport({ ...base, reporter: 'companion', draft: { feelingChange: 'worse', pain: 9, findings: [], items: {} } })
      expect(r.reporter).toBe('companion')
      expect(r.pain).toEqual({ kind: 'missing', reason: 'not_asked' })
    })

    it('sends the circle check as missing with no prompt id, even if a prompt exists and the draft has an answer', () => {
      const r = buildCheckinReport({ ...base, reporter: 'companion', draft: { items: {}, attention: { shown: true, count: 4 } } })
      expect(r.attention).toEqual({ kind: 'missing', reason: 'not_asked' })
      expect('prompt_id' in r.attention).toBe(false)
    })
  })

  it('a follow-up reports only the items asked, and the fixed questions as not_asked', () => {
    const r = buildCheckinReport({
      ...base,
      reporter: 'patient',
      mode: 'followup',
      itemKeys: ['last_known_well'],
      draft: { items: { last_known_well: { kind: 'choice', value: 'under_1_hr' } } },
    })
    expect(r.feeling_now).toEqual({ kind: 'missing', reason: 'not_asked' })
    expect(r.feeling_change).toEqual({ kind: 'missing', reason: 'not_asked' })
    expect(r.new_findings).toEqual({ kind: 'missing', reason: 'not_asked' })
    expect(r.pain).toEqual({ kind: 'missing', reason: 'not_asked' })
    expect(r.attention).toEqual({ kind: 'missing', reason: 'not_asked' })
    expect(Object.keys(r.items ?? {})).toEqual(['last_known_well'])
  })
})
