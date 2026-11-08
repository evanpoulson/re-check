import type { TFunction } from 'i18next'
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

/** Within a minute either side of the deadline, staff screens say "Due now" instead of "0 min". */
export const isDueNow = (ms: number) => Math.abs(ms) < 60_000

/** Past the deadline by more than the "Due now" minute. */
export const isOverdue = (ms: number | null) => ms !== null && ms <= -60_000

/** Patient wording: "1 hour 10 minutes", "45 minutes". Units are spelled out. */
export function durationWords(minutes: number, t: TFunction): string {
  const total = Math.max(0, Math.round(Math.abs(minutes)))
  const h = Math.floor(total / 60)
  const m = total % 60
  const parts = []
  if (h > 0) parts.push(t('duration.hours', { count: h }))
  if (m > 0 || h === 0) parts.push(t('duration.minutes', { count: m }))
  return parts.join(' ')
}

/**
 * The AHS estimate as rounded words ("about 4 to 5 hours"), so nobody subtracts
 * their own wait from a precise-looking figure.
 */
export function waitWords(minutes: number, t: TFunction): string {
  if (minutes < 15) return t('waitWords.short')
  if (minutes < 60) return t('waitWords.minutes', { n: Math.round(minutes / 10) * 10 })
  const lo = Math.floor(minutes / 60)
  return t('waitWords.hours', { lo, hi: lo + 1 })
}

export const sinceMs = (iso: string | null, now: number) => (iso ? now - Date.parse(iso) : null)
export const untilMs = (iso: string | null, now: number) => (iso ? Date.parse(iso) - now : null)

/**
 * "14:05" or "2:05 PM". Staff screens use the browser locale. Patient screens pass
 * the page language so the time reads like the sentence around it.
 */
export const clock = (iso: string, locale?: string) =>
  new Date(iso).toLocaleTimeString(locale ? [locale] : [], { hour: '2-digit', minute: '2-digit' })

/**
 * Wraps a value in Unicode first-strong isolates, the plain-text form of `<bdi>`, so a
 * time such as "2:05 PM" keeps its order inside an Arabic or Urdu sentence.
 */
export const isolate = (value: string) => `\u2068${value}\u2069`
