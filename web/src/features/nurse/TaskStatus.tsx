import { useTranslation } from 'react-i18next'
import type { Task } from '@/api/types'
import { clock, formatMinutes, isDueNow } from '@/lib/time'
import { cn } from '@/lib/utils'

/**
 * Where a task stands, in the same words on the worklist, escalations and handover as on
 * the visit page: "Acknowledgement pending" with its deadline on the next line, or
 * "Assessment pending" with when it was acknowledged. Sentence-case bold, never capitals.
 * Use inside `.review-status`.
 */
export function TaskStatus({ task, now }: { task: Task; now: number }) {
  const { t } = useTranslation()
  const ackDelta = task.ack_due_at ? Date.parse(task.ack_due_at) - now : null
  const overdue = task.status === 'open' && ackDelta !== null && ackDelta < 0 && !isDueNow(ackDelta)
  const timing = task.status === 'open'
    ? ackDelta === null ? null
      : isDueNow(ackDelta) ? t('time.dueNow')
      : overdue ? t('review.ackOverdue', { time: formatMinutes(ackDelta) })
      : t('review.ackDueIn', { time: formatMinutes(ackDelta) })
    : [t('visitPage.ackDone', { time: clock(task.acknowledged_at ?? task.created_at) }), task.acknowledged_by ? t(`role.${task.acknowledged_by.role}`) : null]
      .filter(Boolean).join(' · ')
  return (
    <>
      <span className={cn('block font-semibold', overdue && 'text-level-red')}>
        {t(task.status === 'open' ? 'visitPage.ackPending' : 'visitPage.assessPending')}
      </span>
      {timing && <p className={cn(overdue && 'font-semibold text-level-red')}>{timing}</p>}
      {task.escalated && <p>{t('review.backup')}</p>}
    </>
  )
}
