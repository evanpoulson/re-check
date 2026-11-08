import { useEffect, useState } from 'react'

/** Re-renders on an interval so countdowns stay current. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** "12 min", "1 h 05 min". Negative inputs are formatted as positive; callers add the direction. */
export function formatMinutes(ms: number): string {
  const total = Math.max(0, Math.round(Math.abs(ms) / 60_000))
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = String(total % 60).padStart(2, '0')
  return `${h} h ${m} min`
}

export const sinceMs = (iso: string | null, now: number) => (iso ? now - Date.parse(iso) : null)
export const untilMs = (iso: string | null, now: number) => (iso ? Date.parse(iso) - now : null)

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
