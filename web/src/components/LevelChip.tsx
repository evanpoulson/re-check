import { useTranslation } from 'react-i18next'
import type { TaskLevel } from '@/api/types'
import { cn } from '@/lib/utils'
import { LEVEL_STYLE } from './levelStyle'

/** A task level. Colour, icon and text always appear together. */
export function LevelChip({ level }: { level: TaskLevel }) {
  const { t } = useTranslation()
  const { icon: Icon, cls } = LEVEL_STYLE[level]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap', cls)}>
      <Icon aria-hidden className="size-4" />
      {t(`level.${level}`)}
    </span>
  )
}
