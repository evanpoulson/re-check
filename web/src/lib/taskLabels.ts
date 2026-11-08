import type { Task } from '@/api/types'

export function getPrimaryTaskReason(task: Task): Task['reasons'][number] | undefined {
  const matching = task.reasons.filter((reason) => reason.level === task.level)
  return (matching.length ? matching : task.reasons).reduce<Task['reasons'][number] | undefined>(
    (latest, reason) => !latest || Date.parse(reason.fired_at) >= Date.parse(latest.fired_at) ? reason : latest,
    undefined,
  )
}
