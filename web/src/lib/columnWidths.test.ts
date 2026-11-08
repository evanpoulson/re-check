import { describe, expect, it } from 'vitest'
import { twoLineWidth } from './columnWidths'

describe('triage flag fit', () => {
  it('fits a single flag and keeps up to two flags on separate lines', () => {
    expect(twoLineWidth([102], 6)).toBe(102)
    expect(twoLineWidth([62, 132], 6)).toBe(132)
  })

  it('chooses the narrowest two-line break without splitting or reordering pills', () => {
    expect(twoLineWidth([55, 92, 70, 127], 6)).toBe(203)
    expect(twoLineWidth([132, 55, 54], 6)).toBe(132)
  })
})
