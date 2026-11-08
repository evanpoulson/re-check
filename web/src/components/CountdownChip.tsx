import { useTranslation } from 'react-i18next'
import { formatMinutes, untilMs } from '@/lib/time'
import { cn } from '@/lib/utils'

/** "in 12 min" or "12 min overdue". `null` renders a dash. */
export function CountdownChip({ due, now }: { due: string | null; now: number }) {
  const { t } = useTranslation()
  const ms = untilMs(due, now)
  if (ms === null) return <span className="text-muted">{t('common.none')}</span>
  const overdue = ms < 0
  return (
    <span className={cn('tabular whitespace-nowrap', overdue ? 'font-semibold text-level-overdue' : 'text-ink')}>
      {overdue ? t('time.overdue', { value: formatMinutes(ms) }) : t('time.in', { value: formatMinutes(ms) })}
    </span>
  )
}
