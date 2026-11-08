import { Clock, DoorOpen, Hourglass, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { TaskLevel } from '@/api/types'

/** Icon and chip colours for each level, shared with the board's level filters. */
export const LEVEL_STYLE: Record<TaskLevel, { icon: LucideIcon; cls: string }> = {
  red: { icon: OctagonAlert, cls: 'bg-level-red-bg text-level-red' },
  amber: { icon: TriangleAlert, cls: 'bg-level-amber-bg text-level-amber' },
  silent: { icon: Clock, cls: 'bg-level-silent-bg text-level-silent' },
  leave_risk: { icon: DoorOpen, cls: 'bg-level-leave-bg text-level-leave' },
  overdue: { icon: Hourglass, cls: 'bg-level-overdue-bg text-level-overdue' },
}
