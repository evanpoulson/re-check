import { Clock, DoorOpen, Hourglass, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TaskLevel } from '@/api/types'
import { cn } from '@/lib/utils'

/*
  The glyphs fill their 16px box differently, so each gets an optical correction to look the
  same size with the same spacing: the triangle is drawn shorter, so it is a touch larger; the
  hourglass is narrower, so its empty sides are trimmed. `-ml-px` on every icon evens the
  chip's left padding with its right.
*/
const STYLE: Record<TaskLevel, { icon: LucideIcon; cls: string; fit?: string }> = {
  red: { icon: OctagonAlert, cls: 'bg-level-red-bg text-level-red' },
  amber: { icon: TriangleAlert, cls: 'bg-level-amber-bg text-level-amber', fit: 'size-[17px] -my-px' },
  silent: { icon: Clock, cls: 'bg-level-silent-bg text-level-silent' },
  leave_risk: { icon: DoorOpen, cls: 'bg-level-leave-bg text-level-leave' },
  overdue: { icon: Hourglass, cls: 'bg-level-overdue-bg text-level-overdue', fit: '-ml-[3px] -mr-0.5' },
}

/** A task level. Colour, icon and text always appear together. */
export function LevelChip({ level }: { level: TaskLevel }) {
  const { t } = useTranslation()
  const { icon: Icon, cls, fit } = STYLE[level]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap', cls)}>
      <Icon aria-hidden className={cn('size-4 shrink-0 -ml-px', fit)} />
      {t(`level.${level}`)}
    </span>
  )
}
