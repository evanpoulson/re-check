import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alertDue, useDueAlert } from './dueAlert'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const inMs = (ms: number) => new Date(Date.now() + ms).toISOString()

describe('in-page alert when a check-in comes due', () => {
  it('fires once when the due time passes with the page open', () => {
    const alert = vi.fn(() => () => {})
    const due = inMs(60_000)
    const { result } = renderHook(() => useDueAlert(due, 'Time', alert))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(59_000))
    expect(alert).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(2000))
    expect(alert).toHaveBeenCalledExactlyOnceWith('Time')
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(10 * 60_000))
    expect(alert).toHaveBeenCalledOnce()
  })

  it('does not alert for a check-in that was already due when the page opened', () => {
    const alert = vi.fn(() => () => {})
    const due = inMs(-60_000)
    renderHook(() => useDueAlert(due, 'Time', alert))
    act(() => vi.advanceTimersByTime(10 * 60_000))
    expect(alert).not.toHaveBeenCalled()
  })

  it('stops when the check-in is done and a new due time arrives', () => {
    const stop = vi.fn()
    const alert = vi.fn(() => stop)
    const first = inMs(1000)
    const { result, rerender } = renderHook(({ due }) => useDueAlert(due, 'Time', alert), { initialProps: { due: first } })
    act(() => vi.advanceTimersByTime(1500))
    expect(result.current).toBe(true)
    rerender({ due: inMs(30 * 60_000) })
    expect(stop).toHaveBeenCalledOnce()
    expect(result.current).toBe(false)
  })

  it('flashes the tab title and puts it back when the person taps', () => {
    document.title = 'Waiting room check-ins · Recheck'
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    alertDue("It's time for your check-in.")
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200])
    act(() => vi.advanceTimersByTime(1000))
    expect(document.title).toBe("It's time for your check-in.")
    window.dispatchEvent(new Event('pointerdown'))
    expect(document.title).toBe('Waiting room check-ins · Recheck')
    delete (navigator as unknown as Record<string, unknown>).vibrate
  })
})
