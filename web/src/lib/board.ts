import type { BoardRow, FeelingChange, FeelingNow, TaskLevel, TriageBoard, Worklist, WorklistRow } from '@/api/types'

export interface BoardItem {
  board: BoardRow
  work: WorklistRow
}

export type Condition = FeelingChange | 'unknown'

/**
 * Join the triage board with the worklist on visit id. A board row with no
 * worklist row yet is left out rather than shown half empty.
 */
export function joinBoard(board: TriageBoard, worklist: Worklist): BoardItem[] {
  const work = new Map(worklist.rows.map((w) => [w.visit.visit_id, w]))
  return board.rows.flatMap((b) => {
    const w = work.get(b.visit_id)
    return w ? [{ board: b, work: w }] : []
  })
}

/**
 * Queue order: CTAS first, then arrival. The severity `rank` is deliberately
 * ignored, so a flag changes a badge and never a patient's place in line.
 */
export function sortQueue(items: BoardItem[]): BoardItem[] {
  return [...items].sort(
    (a, b) => a.board.ctas - b.board.ctas || Date.parse(a.board.triaged_at) - Date.parse(b.board.triaged_at),
  )
}

/**
 * Condition is how the latest check-in answered "compared with when staff last
 * checked". An unanswered latest check-in is `unknown`, never `same`.
 */
export function conditionOf(work: WorklistRow): Condition {
  const latest = work.trend[work.trend.length - 1]
  return latest?.feeling_change ?? 'unknown'
}

/** How the latest check-in answered "how are you feeling right now", if it did. */
export function feelingNowOf(work: WorklistRow): FeelingNow | null {
  return work.trend[work.trend.length - 1]?.feeling_now ?? null
}

/** True when the app is not offered, so staff watch this patient directly and there are no patient prompts. */
export const appNotOffered = (w: WorklistRow): boolean => w.visit.app_exclusion !== null

export const needsReview = ({ board, work }: BoardItem): boolean =>
  board.level !== null ||
  work.silent ||
  work.prompt_overdue ||
  board.reassess_overdue ||
  work.reassess_overdue ||
  work.leave_risk

export const LEVEL_ORDER: TaskLevel[] = ['red', 'amber', 'silent', 'leave_risk', 'overdue']

export function countByLevel(items: BoardItem[]): Record<TaskLevel, number> {
  const counts: Record<TaskLevel, number> = { red: 0, amber: 0, silent: 0, leave_risk: 0, overdue: 0 }
  for (const { board } of items) if (board.level) counts[board.level] += 1
  return counts
}

export interface Filters {
  needsReview: boolean
  ctas: number | null
  complaint: string | null
}

export function applyFilters(items: BoardItem[], f: Filters): BoardItem[] {
  return items.filter(
    (i) =>
      (!f.needsReview || needsReview(i)) &&
      (f.ctas === null || i.board.ctas === f.ctas) &&
      (f.complaint === null || i.board.complaint_group === f.complaint),
  )
}

export const shortRef = (w: WorklistRow) => w.visit.pager_no ? `Pager ${w.visit.pager_no}` : `P-${w.visit.visit_id.slice(0, 4)}`
