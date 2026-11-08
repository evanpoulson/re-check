import { describe, expect, it } from 'vitest'
import { alwaysVisible, allowUnsure, attentionParams, bankVersion, noneOption, optionLabel, options, section, text } from './bank'
import { baseItems, followUps, isEnabled, rawAnswers } from './enableWhen'
import type { ComplaintGroup } from './types'

const GROUPS: ComplaintGroup[] = ['chest_back_pain', 'neuro_change', 'head_injury', 'confused_drowsy', 'general']

// Codes taken from contract.d.ts, which is generated from the backend.
const FEELING_NOW = ['very_good', 'good', 'ok', 'poor', 'very_poor']
const FEELING_CHANGE = ['much_better', 'better', 'same', 'worse', 'much_worse']
const FINDINGS = [
  'chest_pain', 'trouble_breathing', 'new_confusion', 'fainting', 'new_weakness_numbness', 'heavy_bleeding', 'vomiting',
  'worst_headache', 'speech_change', 'facial_droop', 'drowsiness', 'vision_change', 'balance_change',
]

describe('question bank copy', () => {
  it('has a version the frontend can pin', () => {
    expect(bankVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/)
  })

  it('has option text for every contract code, in the contract order for the 5-point questions', () => {
    expect(options('feeling_now').map((o) => o.code)).toEqual(FEELING_NOW)
    expect(options('feeling_change').map((o) => o.code)).toEqual(FEELING_CHANGE)
    expect(options('new_findings').map((o) => o.code).sort()).toEqual([...FINDINGS].sort())
    expect(options('complaint_group').map((o) => o.code).sort()).toEqual([...GROUPS].sort())
  })

  it('gives companion wording where the bank has it', () => {
    expect(text('feeling_now', 'patient')).toBe('How are you feeling right now?')
    expect(text('feeling_now', 'companion')).toBe('How do they seem right now?')
    expect(optionLabel('feeling_change', 'same')).toBe('About the same')
  })

  it('every always-visible button has companion wording and the concerns match the contract', () => {
    const buttons = alwaysVisible()
    expect(buttons.map((b) => b.concern).filter(Boolean).sort()).toEqual(['desk_question', 'help_now', 'worried'])
    expect(buttons.some((b) => b.reportKind === 'leaving')).toBe(true)
    for (const b of buttons) expect(text(b.linkId, 'companion')).not.toBe(b.linkId)
  })

  it('knows where "Not sure" is allowed and what the none-option says', () => {
    expect(allowUnsure('feeling_now')).toBe(true)
    expect(noneOption('new_findings')).toBe('None of these')
  })

  it('reads sane circle-check settings', () => {
    const p = attentionParams()
    expect(p.circlesMin).toBeGreaterThanOrEqual(1)
    expect(p.circlesMin).toBeLessThanOrEqual(p.circlesMax)
    expect(p.showMs).toBeGreaterThanOrEqual(200)
    expect(p.expiresMinutes).toBeGreaterThan(0)
  })

  it('has no "dont know" style options (unknown is a missing reason)', () => {
    for (const key of [...section('base'), ...section('follow_up')]) {
      for (const o of options(key)) expect(['dont_know', 'not_sure', 'unknown']).not.toContain(o.code)
    }
  })
})

// Ported from api/tests/question_bank/test_question_bank.py.
describe('branching (mirrors question_bank.py)', () => {
  it('patient-only base items', () => {
    expect(baseItems('patient')).toEqual(['feeling_now', 'feeling_change', 'pain', 'new_findings', 'circle_count'])
    expect(baseItems('companion')).toEqual(['feeling_now', 'feeling_change', 'new_findings'])
  })

  it('the general group gets no follow-ups', () => {
    expect(followUps('general', '251', {})).toEqual([[], []])
  })

  it('chest pain follow-ups branch on answers', () => {
    expect(followUps('chest_back_pain', '003', {})).toEqual([['pain_moved', 'pain_sudden_worse'], []])
    expect(followUps('chest_back_pain', '003', { pain_moved: true })).toEqual([
      ['pain_moved', 'pain_new_location', 'pain_sudden_worse'],
      ['change_started'],
    ])
    expect(followUps('chest_back_pain', '003', { pain_moved: false })[1]).toEqual([])
  })

  it('the headache question is only for the headache complaint', () => {
    expect(followUps('neuro_change', '404', {})[0]).toContain('headache_sudden_worse')
    expect(followUps('neuro_change', '403', {})[0]).not.toContain('headache_sudden_worse')
  })

  it('head injury and confused share items', () => {
    expect(followUps('head_injury', '407', {})[0]).toEqual(['harder_to_wake', 'vomit_count', 'headache_change', 'seizure', 'more_confused'])
    expect(followUps('confused_drowsy', '402', {})[0]).toEqual(['harder_to_wake', 'seizure', 'more_confused'])
  })

  it.each(GROUPS)('a neurological finding offers last_known_well in %s', (group) => {
    expect(followUps(group, null, { new_findings: ['chest_pain', 'speech_change'] })[1]).toContain('last_known_well')
    expect(followUps(group, null, { new_findings: ['chest_pain'] })[1]).not.toContain('last_known_well')
  })

  it('"not sure" never opens a follow-up, "yes" does', () => {
    const unsure = rawAnswers({ pain_moved: { kind: 'missing', reason: 'unsure' } })
    expect(followUps('chest_back_pain', '003', unsure)[1]).toEqual([])
    const yes = rawAnswers({ pain_moved: { kind: 'yes_no', value: true } })
    expect(followUps('chest_back_pain', '003', yes)[1]).toEqual(['change_started'])
  })

  it('after-routing items are never asked first', () => {
    for (const group of GROUPS) {
      const [now] = followUps(group, null, { pain_moved: true, new_findings: ['facial_droop'] })
      expect(now).not.toContain('change_started')
      expect(now).not.toContain('last_known_well')
    }
  })

  it('isEnabled treats several conditions with any or all', () => {
    expect(isEnabled('change_started', { pain_moved: true })).toBe(true) // any
    expect(isEnabled('change_started', { pain_sudden_worse: true })).toBe(true)
    expect(isEnabled('change_started', {})).toBe(false)
    expect(isEnabled('headache_sudden_worse', { complaint_group: 'neuro_change', cedis_code: '404' })).toBe(true) // all
    expect(isEnabled('headache_sudden_worse', { complaint_group: 'neuro_change' })).toBe(false)
  })
})
