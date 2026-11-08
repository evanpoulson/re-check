import { COMPLAINT_GROUPS } from './enrol'
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

export const LEVEL_ORDER: TaskLevel[] = ['red', 'amber', 'silent', 'leave_risk', 'overdue']

export function countByLevel(items: BoardItem[]): Record<TaskLevel, number> {
  const counts: Record<TaskLevel, number> = { red: 0, amber: 0, silent: 0, leave_risk: 0, overdue: 0 }
  for (const { board } of items) if (board.level) counts[board.level] += 1
  return counts
}

/** The board columns that have a filter menu in their header. */
export type FilterColumn = 'ref' | 'ctas' | 'complaint' | 'condition' | 'flags' | 'lastCheckin'

/** Each column's choices, in menu order. */
export const FILTER_OPTIONS: Record<FilterColumn, readonly string[]> = {
  // The patient column filters on who is signed in; "no_app" is a patient the app is not offered to.
  ref: ['patient', 'companion', 'none', 'no_app'],
  ctas: ['2', '3', '4', '5'],
  complaint: COMPLAINT_GROUPS,
  condition: ['much_worse', 'worse', 'same', 'better', 'much_better', 'unknown'],
  // A flag matches the chip the row shows, so "Silent" also finds "No response" and "Overdue" also finds "Reassess overdue".
  flags: ['red', 'amber', 'silent', 'leave_risk', 'overdue', 'app_not_offered', 'none'],
  lastCheckin: ['patient', 'companion', 'staff', 'none'],
}

/** The values a row has in a filterable column. A row can show several flags, so this is a list. */
export function columnValues(col: FilterColumn, { board, work }: BoardItem): string[] {
  const excluded = appNotOffered(work)
  switch (col) {
    case 'ref':
      return [excluded ? 'no_app' : (work.visit.signed_in_as ?? 'none')]
    case 'ctas':
      return [String(board.ctas)]
    case 'complaint':
      return [board.complaint_group]
    case 'condition':
      return [conditionOf(work)]
    case 'lastCheckin':
      return [work.last_report?.reporter ?? 'none']
    case 'flags': {
      const flags = new Set<string>()
      if (board.level) flags.add(board.level)
      if (excluded) flags.add('app_not_offered')
      if (!excluded && (work.silent || work.prompt_overdue)) flags.add('silent')
      if (work.leave_risk) flags.add('leave_risk')
      if (board.reassess_overdue) flags.add('overdue')
      if (flags.size === 0) flags.add('none')
      return [...flags]
    }
  }
}

/**
 * The board's filters. Choices within one column are "any of"; columns combine with
 * "and". An empty or missing list means the column is not filtered.
 */
export interface Filters {
  /** Only rows flagged at this level (the level cards). */
  level: TaskLevel | null
  columns: Partial<Record<FilterColumn, string[]>>
}

export const NO_FILTERS: Filters = { level: null, columns: {} }

/** The columns with at least one choice picked, in column order. */
export const activeColumns = (f: Filters): FilterColumn[] =>
  (Object.keys(FILTER_OPTIONS) as FilterColumn[]).filter((c) => (f.columns[c]?.length ?? 0) > 0)

export const isFiltered = (f: Filters): boolean => f.level !== null || activeColumns(f).length > 0

export function applyFilters(items: BoardItem[], f: Filters): BoardItem[] {
  const cols = activeColumns(f)
  return items.filter(
    (i) =>
      (!f.level || i.board.level === f.level) &&
      cols.every((c) => columnValues(c, i).some((v) => f.columns[c]!.includes(v))),
  )
}

/** Turns one choice on or off in a column. */
export function toggleChoice(f: Filters, col: FilterColumn, value: string): Filters {
  const current = f.columns[col] ?? []
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return { ...f, columns: { ...f.columns, [col]: next } }
}

/** How many rows of the full queue have each choice, for the counts in a filter menu. */
export function countChoices(items: BoardItem[], col: FilterColumn): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(FILTER_OPTIONS[col].map((o) => [o, 0]))
  for (const i of items) for (const v of columnValues(col, i)) if (v in counts) counts[v]! += 1
  return counts
}

/** The visit's own reference, the same with or without a pager. */
export const visitRef = (w: WorklistRow) => `P-${w.visit.visit_id.slice(0, 4)}`

export const shortRef = (w: WorklistRow) => w.visit.pager_no ? `Pager ${w.visit.pager_no}` : `P-${w.visit.visit_id.slice(0, 4)}`

/**
 * Optional manual sorts. Each one reorders rows only; the place in line always
 * comes from queue order, so a sort never renumbers a patient.
 */
export type BoardSort = 'place' | 'waiting' | 'nextCheckin' | 'reassess'

const dueOrLast = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY)

export function sortRows(items: BoardItem[], by: BoardSort, reversed = false): BoardItem[] {
  if (by === 'place') return reversed ? [...items].reverse() : items
  const key: Record<Exclude<BoardSort, 'place'>, (i: BoardItem) => number> = {
    // Longest wait first.
    waiting: (i) => Date.parse(i.board.triaged_at),
    // Soonest due first; no app or no prompt sorts last.
    nextCheckin: (i) => (appNotOffered(i.work) ? Number.POSITIVE_INFINITY : dueOrLast(i.work.visit.next_prompt_due_at)),
    reassess: (i) => dueOrLast(i.board.staff_reassess_due_at),
  }
  const k = key[by]
  return [...items].sort((a, b) => {
    const first = k(a)
    const second = k(b)
    if (first === second) return 0
    if (!Number.isFinite(first)) return 1
    if (!Number.isFinite(second)) return -1
    return (first - second) * (reversed ? -1 : 1)
  })
}
