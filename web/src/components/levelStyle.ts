import { Clock, DoorOpen, Hourglass, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { TaskLevel } from '@/api/types'

/**
 * The one style per task level, used by `LevelChip`, the board's level filters and
 * row bars, and the visit page's concern banner. `cls` tints a chip, `edge` colours a
 * border, `tone` tints a whole panel (its background and border), `bar` is the colour itself. No other status (condition, demo badge) uses these.
 */
export const LEVEL_STYLE: Record<TaskLevel, { icon: LucideIcon; cls: string; edge: string; tone: string; bar: string }> = {
  red: { icon: OctagonAlert, cls: 'bg-level-red-bg text-level-red', edge: 'border-l-level-red', tone: 'border-level-red bg-level-red-bg', bar: 'var(--color-level-red)' },
  amber: { icon: TriangleAlert, cls: 'bg-level-amber-bg text-level-amber', edge: 'border-l-level-amber', tone: 'border-level-amber bg-level-amber-bg', bar: 'var(--color-level-amber)' },
  silent: { icon: Clock, cls: 'bg-level-silent-bg text-level-silent', edge: 'border-l-level-silent', tone: 'border-level-silent bg-level-silent-bg', bar: 'var(--color-level-silent)' },
  leave_risk: { icon: DoorOpen, cls: 'bg-level-leave-bg text-level-leave', edge: 'border-l-level-leave', tone: 'border-level-leave bg-level-leave-bg', bar: 'var(--color-level-leave)' },
  overdue: { icon: Hourglass, cls: 'bg-level-overdue-bg text-level-overdue', edge: 'border-l-level-overdue', tone: 'border-level-overdue bg-level-overdue-bg', bar: 'var(--color-level-overdue)' },
}

/** The shape every status chip shares (level, condition): a small pill that never wraps. Icons are sized in em, so they grow with the text. */
export const CHIP = 'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-note font-semibold whitespace-nowrap [&>svg]:size-[1.25em] [&>svg]:shrink-0'
