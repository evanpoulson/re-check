import { ChevronsDown, ChevronsUp, CircleHelp, Minus, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { optionLabel } from '@/api/bank'
import type { Condition } from '@/lib/board'
import { cn } from '@/lib/utils'

const STYLE: Record<Condition, { icon: LucideIcon; cls: string }> = {
  much_worse: { icon: ChevronsDown, cls: 'bg-level-red-bg text-level-red' },
  worse: { icon: ChevronDown, cls: 'bg-level-amber-bg text-level-amber' },
  same: { icon: Minus, cls: 'bg-level-overdue-bg text-level-overdue' },
  better: { icon: ChevronUp, cls: 'bg-level-overdue-bg text-level-overdue' },
  much_better: { icon: ChevronsUp, cls: 'bg-level-overdue-bg text-level-overdue' },
  unknown: { icon: CircleHelp, cls: 'border border-line bg-surface text-muted' },
}

/**
 * The latest "compared with when staff last checked" answer. Worse states are
 * warm, better states are plain grey: reassurance is never a colour. "Unknown"
 * is its own state and never shown as "same". Label text comes from the bank.
 */
export function StateChip({ condition }: { condition: Condition }) {
  const { t } = useTranslation()
  const { icon: Icon, cls } = STYLE[condition]
  const label = condition === 'unknown' ? t('condition.unknown') : optionLabel('feeling_change', condition)
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-data px-2 py-0.5 text-sm font-bold', cls)}>
      <Icon aria-hidden className="size-4" />
      {label}
    </span>
  )
}
