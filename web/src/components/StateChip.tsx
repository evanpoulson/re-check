import { ChevronsDown, ChevronsUp, CircleHelp, Minus, ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { optionLabel } from '@/api/bank'
import type { Condition } from '@/lib/board'
import { cn } from '@/lib/utils'
import { CHIP } from './levelStyle'

// Outlined and uncoloured: no task level looks like this, so "Better" never reads as "Overdue".
const OUTLINE = 'border border-answer bg-surface text-ink'
const STYLE: Record<Condition, { icon: LucideIcon; cls: string }> = {
  much_worse: { icon: ChevronsDown, cls: OUTLINE },
  worse: { icon: ChevronDown, cls: OUTLINE },
  same: { icon: Minus, cls: OUTLINE },
  better: { icon: ChevronUp, cls: OUTLINE },
  much_better: { icon: ChevronsUp, cls: OUTLINE },
  unknown: { icon: CircleHelp, cls: 'border border-dashed border-answer bg-surface text-muted' },
}

/**
 * The latest "compared with when staff last checked" answer: an outlined chip whose
 * arrows show the direction. Colour is kept for task levels, and reassurance is never
 * a colour. "Unknown" is its own state and never shown as "same". Label text comes from the bank.
 */
export function StateChip({ condition }: { condition: Condition }) {
  const { t } = useTranslation()
  const { icon: Icon, cls } = STYLE[condition]
  const label = condition === 'unknown' ? t('condition.unknown') : optionLabel('feeling_change', condition)
  return (
    <span className={cn(CHIP, cls)}>
      <Icon aria-hidden />
      {label}
    </span>
  )
}
