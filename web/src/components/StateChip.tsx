import { ArrowDown, ArrowRight, ArrowUp, CircleHelp, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Condition } from '@/lib/board'
import { cn } from '@/lib/utils'

const STYLE: Record<Condition, { icon: LucideIcon; cls: string }> = {
  worse: { icon: ArrowDown, cls: 'bg-level-amber-bg text-level-amber' },
  same: { icon: ArrowRight, cls: 'bg-slate-100 text-muted' },
  better: { icon: ArrowUp, cls: 'bg-slate-100 text-muted' },
  unknown: { icon: CircleHelp, cls: 'bg-slate-100 text-muted' },
}

/** The latest reported condition. "Unknown" is never shown as "same". */
export function StateChip({ condition }: { condition: Condition }) {
  const { t } = useTranslation()
  const { icon: Icon, cls } = STYLE[condition]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold', cls)}>
      <Icon aria-hidden className="size-4" />
      {t(`condition.${condition}`)}
    </span>
  )
}
