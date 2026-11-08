import { useTranslation } from 'react-i18next'
import type { Task, TaskLevel } from '@/api/types'
import { formatMinutes, isDueNow } from '@/lib/time'
import { cn } from '@/lib/utils'

/**
 * Where a task stands, in the redesign's compact form: one main line, such as
 * "Acknowledgement pending · 6 min overdue" (red when overdue) or "Assessment pending",
 * and at most one quiet line under it that joins "Routed to backup" with the `notes`
 * passed in (for example the staff reassessment). Use inside `.review-status`.
 */
export function TaskStatus({ task, now, notes = [] }: { task: Task; now: number; notes?: (string | null | false)[] }) {
  const { t } = useTranslation()
  const ackDelta = task.ack_due_at ? Date.parse(task.ack_due_at) - now : null
  const open = task.status === 'open'
  const overdue = open && ackDelta !== null && ackDelta < 0 && !isDueNow(ackDelta)
  const timing = !open || ackDelta === null ? null
    : isDueNow(ackDelta) ? t('review.dueNow')
    : t(overdue ? 'review.overdueBy' : 'review.dueIn', { time: formatMinutes(ackDelta) })
  const sub = [task.escalated && t('review.backup'), ...notes].filter(Boolean).join(' · ')
  return (
    <>
      <span className={cn('block', overdue && 'font-semibold text-level-red')}>
        {t(open ? 'visitPage.ackPending' : 'visitPage.assessPending')}
        {timing && ` · ${timing}`}
      </span>
      {sub && <p>{sub}</p>}
    </>
  )
}

/**
 * A task level in the worklist's quiet form: a small dot and the level's name in its own
 * colour ("Urgent review", "Missed check-in"). Text always goes with the colour. The board
 * and visit pages use `LevelChip`.
 */
export function TaskLevelLabel({ level }: { level: TaskLevel }) {
  const { t } = useTranslation()
  return <span className={cn('task-label', `task-${level}`)}>{t(`taskLevel.${level}`)}</span>
}
