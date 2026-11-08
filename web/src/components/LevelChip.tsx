import { Clock, DoorOpen, Hourglass, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TaskLevel } from '@/api/types'
import { cn } from '@/lib/utils'

const STYLE: Record<TaskLevel, { icon: LucideIcon; cls: string }> = {
  red: { icon: OctagonAlert, cls: 'bg-level-red-bg text-level-red' },
  amber: { icon: TriangleAlert, cls: 'bg-level-amber-bg text-level-amber' },
  silent: { icon: Clock, cls: 'bg-level-silent-bg text-level-silent' },
  leave_risk: { icon: DoorOpen, cls: 'bg-level-leave-bg text-level-leave' },
  overdue: { icon: Hourglass, cls: 'bg-level-overdue-bg text-level-overdue' },
}

/** A task level. Colour, icon and text always appear together. */
export function LevelChip({ level }: { level: TaskLevel }) {
  const { t } = useTranslation()
  const { icon: Icon, cls } = STYLE[level]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold', cls)}>
      <Icon aria-hidden className="size-4" />
      {t(`level.${level}`)}
    </span>
  )
}
