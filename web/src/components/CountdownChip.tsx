import { useTranslation } from 'react-i18next'
import { durationWords, formatMinutes, untilMs } from '@/lib/time'
import { cn } from '@/lib/utils'

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
  return (
    <span className={cn('tabular whitespace-nowrap', overdue ? 'font-semibold text-level-overdue' : 'text-ink')}>
      {overdue ? t('time.overdue', { value: formatMinutes(ms) }) : t('time.in', { value: formatMinutes(ms) })}
    </span>
  )
}
