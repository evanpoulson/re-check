import { Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { durationWords, formatMinutes, untilMs } from '@/lib/time'

/**
 * "in 12 min" or "12 min overdue". `null` renders a dash. The patient view says
 * "Ready now" instead of "overdue" and spells out units, so nobody feels blamed.
 */
export function CountdownChip({ due, now, patient = false }: { due: string | null; now: number; patient?: boolean }) {
  const { t } = useTranslation()
  const ms = untilMs(due, now)
  if (ms === null) return <span className="text-muted">{t('common.none')}</span>
  const overdue = ms < 0
  if (patient) {
    return (
      <span className="tabular whitespace-nowrap text-ink">
        {overdue ? t('time.readyNow') : t('duration.inTime', { value: durationWords(ms / 60_000, t) })}
      </span>
    )
  }
  // Overdue uses the overdue chip (colour, icon and text), like every other status.
  if (overdue) {
    return (
      <span className="tabular inline-flex items-center gap-1 rounded-full bg-level-overdue-bg px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap text-level-overdue">
        <Hourglass aria-hidden className="size-4" />
        {t('time.overdue', { value: formatMinutes(ms) })}
      </span>
    )
  }
  return <span className="tabular whitespace-nowrap text-ink">{t('time.in', { value: formatMinutes(ms) })}</span>
}
