import { describe, expect, it } from 'vitest'
import { emptyVitals, validateVitals } from './vitals'

const run = (patch: Partial<typeof emptyVitals>) =>
  validateVitals({ ...emptyVitals, ...patch }, 'v1', 's1', '2026-11-07T18:00:00.000Z')

describe('validateVitals (mirrors VitalsCreate)', () => {
  it('needs at least one measurement', () => expect(run({})).toEqual({ ok: false, error: 'none' }))
  it('needs sbp and dbp together', () => expect(run({ sbp: '120' })).toEqual({ ok: false, error: 'bpPair' }))
  it('needs dbp lower than sbp', () => expect(run({ sbp: '80', dbp: '80' })).toEqual({ ok: false, error: 'bpOrder' }))

  it('rejects typos but not abnormal values', () => {
    expect(run({ hr: '900' })).toEqual({ ok: false, error: 'range' })
    expect(run({ hr: 'abc' })).toEqual({ ok: false, error: 'range' })
    expect(run({ temp_c: '50' })).toEqual({ ok: false, error: 'range' })
    expect(run({ hr: '30', spo2: '60' }).ok).toBe(true) // abnormal but plausible
  })

  it('builds the body with only the entered values and the correction link', () => {
    expect(run({ sbp: '150', dbp: '90', temp_c: '37.4', supersedes: 'old' })).toEqual({
      ok: true,
      body: {
        submission_id: 's1',
        visit_id: 'v1',
        measured_at: '2026-11-07T18:00:00.000Z',
        sbp: 150,
        dbp: 90,
        temp_c: 37.4,
        supersedes: 'old',
      },
    })
  })
})
