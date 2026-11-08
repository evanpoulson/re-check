import type { TaskLevel } from '@/api/types'

export const taskLabel: Record<TaskLevel, string> = {
  red: 'Urgent review',
  amber: 'Review needed',
  silent: 'Missed check-in',
  leave_risk: 'May leave',
  overdue: 'Reassessment due',
}
