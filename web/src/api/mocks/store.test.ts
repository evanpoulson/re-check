import { describe, expect, it } from 'vitest'
import en from '@/i18n/en.json'
import { checkEnrolment } from '../cedis'
import type { TaskLevel } from '../types'
import { demoStaffSignIn, demoVisitId, escalations, worklist } from './store'

describe('seeded waiting room', () => {
  it('has a realistic spread that stays readable on every staff screen', () => {
    const rows = worklist().rows
    expect(rows.length).toBeGreaterThanOrEqual(20)

    // Visit references (P-xxxx) and pager numbers are unique.
    const refs = rows.map((r) => r.visit.visit_id.slice(0, 4))
    expect(new Set(refs).size).toBe(rows.length)
    const pagers = rows.flatMap((r) => (r.visit.pager_no ? [r.visit.pager_no] : []))
    expect(new Set(pagers).size).toBe(pagers.length)

    // Every level at least twice; every reason has a translation.
    const levels: Record<TaskLevel, number> = { red: 0, amber: 0, silent: 0, leave_risk: 0, overdue: 0 }
    for (const r of rows) if (r.open_task) levels[r.open_task.level] += 1
    for (const n of Object.values(levels)) expect(n).toBeGreaterThanOrEqual(2)
    const reasons = en.reason as Record<string, string>
    for (const r of rows) for (const x of r.open_task?.reasons ?? []) expect(reasons[x.reason_code]).toBeTruthy()

    // Every CTAS 2 to 5, every complaint group, and CEDIS codes that agree with the backend map.
    expect(new Set(rows.map((r) => r.visit.ctas))).toEqual(new Set([2, 3, 4, 5]))
    expect(new Set(rows.map((r) => r.visit.complaint_group))).toEqual(
      new Set(['general', 'chest_back_pain', 'neuro_change', 'head_injury', 'confused_drowsy']),
    )
    for (const r of rows) expect(checkEnrolment(r.visit)).toBeNull()

    // Task states, sign-ins and channels.
    const tasks = rows.flatMap((r) => (r.open_task ? [r.open_task] : []))
    expect(tasks.some((t) => t.status === 'open' && !t.escalated)).toBe(true)
    expect(tasks.some((t) => t.status === 'acknowledged')).toBe(true)
    expect(tasks.filter((t) => t.escalated).length).toBeGreaterThanOrEqual(2)
    expect(rows.some((r) => !r.open_task)).toBe(true)
    expect(rows.some((r) => r.reassess_overdue)).toBe(true)
    expect(rows.some((r) => r.prompt_overdue && !r.silent)).toBe(true)
    for (const who of ['patient', 'companion', null]) expect(rows.some((r) => !r.visit.app_exclusion && r.visit.signed_in_as === who)).toBe(true)
    expect(new Set(rows.map((r) => r.visit.channel))).toEqual(new Set(['phone', 'pager', null]))
    expect(new Set(rows.flatMap((r) => (r.visit.app_exclusion ? [r.visit.app_exclusion] : []))).size).toBeGreaterThanOrEqual(3)

    demoStaffSignIn('charge_nurse')
    expect(escalations().tasks.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the original demo cases', () => {
    const rows = worklist().rows
    const byRef = (ref: string) => rows.find((r) => r.visit.visit_id === demoVisitId(ref))!
    expect(byRef('chest').open_task).toMatchObject({ level: 'red', escalated: true, reasons: [{ reason_code: 'finding_chest_pain' }] })
    expect(byRef('general').open_task).toBeNull()
    expect(byRef('head').open_task).toMatchObject({ level: 'silent', reasons: [{ reason_code: 'missed_checkin' }] })
    expect(byRef('confused').visit.signed_in_as).toBe('companion')
    expect(byRef('child').visit).toMatchObject({ ctas: 4, app_exclusion: 'child' })
  })
})
