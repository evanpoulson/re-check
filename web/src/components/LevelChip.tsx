import { useTranslation } from 'react-i18next'
import type { TaskLevel } from '@/api/types'
import { cn } from '@/lib/utils'
import { CHIP, LEVEL_STYLE } from './levelStyle'

/**
 * A task level. Colour, icon and text always appear together. `label` replaces the
 * level's name with a more specific one in the same style, such as "Reassessment overdue".
 */
export function LevelChip({ level, label, className }: { level: TaskLevel; label?: string; className?: string }) {
  const { t } = useTranslation()
  const { icon: Icon, cls } = LEVEL_STYLE[level]
  return (
    <span className={cn(CHIP, cls, className)}>
      <Icon aria-hidden />
      {label ?? t(`level.${level}`)}
    </span>
  )
}
