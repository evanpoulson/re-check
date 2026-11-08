import { Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { durationWords, formatMinutes, isDueNow, isOverdue, untilMs } from '@/lib/time'
import { cn } from '@/lib/utils'

/**
 * "in 12 min", "Due now" or "12 min overdue". `null` renders a dash. The patient view
 * says "Ready now" instead of "overdue" and spells out units, so nobody feels blamed.
 */
export function CountdownChip({ due, now, patient = false, className }: {
  due: string | null
  now: number
  patient?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const ms = untilMs(due, now)
  if (ms === null) return <span className="text-muted">{t('common.none')}</span>
  if (patient) {
    return (
      <span dir="auto" className="tabular whitespace-nowrap text-ink">
        {ms < 0 ? t('time.readyNow') : t('duration.inTime', { value: durationWords(ms / 60_000, t) })}
      </span>
    )
  }
  // Overdue uses the overdue chip (colour, icon and text), like every other status.
  if (isOverdue(ms)) {
    return (
      <span className={cn('tabular inline-flex items-center gap-1 rounded-full bg-level-overdue-bg px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap text-level-overdue', className)}>
        <Hourglass aria-hidden className="size-4 shrink-0" />
        {t('time.overdue', { value: formatMinutes(ms) })}
      </span>
    )
  }
  // Within a minute either side of the deadline: "Due now", never "in 0 min" or "0 min overdue".
  return (
    <span className={cn('tabular whitespace-nowrap text-ink', isDueNow(ms) && 'font-semibold', className)}>
      {isDueNow(ms) ? t('time.dueNow') : t('time.in', { value: formatMinutes(ms) })}
    </span>
  )
}
