import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './en.json'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return files(p)
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : []
  })
}
const has = (key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en) !== undefined

describe('translations', () => {
  it('every literal t("key") used in the app exists in en.json', () => {
    const missing: string[] = []
    for (const f of files('src')) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!has(m[1]!)) missing.push(`${f}: ${m[1]}`)
      for (const m of src.matchAll(/titleKey="([a-zA-Z0-9_.]+)"/g)) if (!has(m[1]!)) missing.push(`${f}: ${m[1]}`)
    }
    expect(missing).toEqual([])
  })

  it('every contract code that is shown has text', () => {
    const groups: Record<string, string[]> = {
      level: ['red', 'amber', 'silent', 'leave_risk', 'overdue'],
      missing: ['unsure', 'unable_to_respond', 'not_asked', 'not_reached'],
      disposition: ['assessed_stable', 'tests_ordered', 're_triaged', 'roomed', 'treated_and_released', 'left_before_assessment', 'not_located'],
      taskEvent: ['created', 'reason_added', 'level_raised', 'escalated', 'delivered', 'acknowledged', 'assessed'],
      message: ['none', 'clinician_will_check', 'clinician_told', 'leaving_info'],
      complaint: ['chest_back_pain', 'neuro_change', 'head_injury', 'confused_drowsy', 'general'],
      exclusion: ['child', 'pregnancy_over_20_weeks', 'self_harm_or_violence', 'major_trauma'],
      reporter: ['patient', 'companion', 'staff'],
      role: ['triage_nurse', 'physician', 'charge_nurse', 'quality'],
      sessionEnd: ['takeover', 'signed_out', 'staff_signed_out', 'visit_closed', 'app_excluded'],
      'signedIn.short': ['patient', 'companion', 'none'],
      'exchange.role': ['patient', 'companion'],
      'exchange.signedInAs': ['patient', 'companion'],
      'triageInfo.level': ['2', '3', '4', '5'].flatMap((n) => [`${n}.name`, `${n}.body`]),
    }
    const missing = Object.entries(groups).flatMap(([g, codes]) =>
      codes.filter((c) => !has(`${g}.${c}`)).map((c) => `${g}.${c}`),
    )
    expect(missing).toEqual([])
  })

  it('the triage explainer never gives a target time', () => {
    const strings = (o: unknown): string[] =>
      typeof o === 'string' ? [o] : Object.values(o as Record<string, unknown>).flatMap(strings)
    const timed = strings(en.triageInfo).filter((s) => /\d+\s*(min|minute|hour|h)\b|within|minutes|hours/i.test(s))
    expect(timed).toEqual([])
  })
})
