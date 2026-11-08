import { describe, expect, it } from 'vitest'
import type { BoardRow, TriageBoard, Worklist, WorklistRow } from '@/api/types'
import {
  NO_FILTERS,
  activeColumns,
  appNotOffered,
  applyFilters,
  columnValues,
  conditionOf,
  countByLevel,
  countChoices,
  feelingNowOf,
  isFiltered,
  joinBoard,
  sortQueue,
  sortRows,
  toggleChoice,
} from './board'

const iso = (min: number) => new Date(Date.UTC(2026, 10, 7, 18, 0) - min * 60_000).toISOString()

function row(id: string, ctas: number, triagedMinAgo: number, level: BoardRow['level'] = null, over: Partial<WorklistRow> = {}) {
  const board: BoardRow = {
    visit_id: id,
    ctas,
    complaint_group: 'general',
    triaged_at: iso(triagedMinAgo),
    level,
    staff_reassess_due_at: iso(-10),
    reassess_overdue: false,
  }
  const work: WorklistRow = {
    rank: 1,
    visit: {
      visit_id: id,
      site_id: 's',
      ctas,
      complaint_group: 'general',
      cedis_code: null,
      language: 'en',
      app_exclusion: null,
      channel: 'phone',
      pager_no: null,
      status: 'waiting',
      triaged_at: iso(triagedMinAgo),
      closed_at: null,
      next_prompt_due_at: iso(-10),
      staff_reassess_due_at: iso(-10),
      last_staff_check_at: null,
      signed_in_as: null,
      signed_in_since: null,
    },
    open_task: null,
    silent: false,
    leave_risk: false,
    prompt_overdue: false,
    reassess_overdue: false,
    last_report: null,
    trend: [],
    ...over,
  }
  return { board, work }
}

type R = ReturnType<typeof row>

// The worklist is severity ranked: the flagged row comes first, like the backend's.
const toApi = (items: R[]): [TriageBoard, Worklist] => [
  { generated_at: iso(0), rows: items.map((i) => i.board) },
  {
    generated_at: iso(0),
    rows: [...items].sort((a, b) => Number(!!b.board.level) - Number(!!a.board.level)).map((i, n) => ({ ...i.work, rank: n + 1 })),
  },
]
const order = (items: R[]) => {
  const [b, w] = toApi(items)
  return sortQueue(joinBoard(b, w)).map((i) => i.board.visit_id)
}

describe('board', () => {
  it('joins the board and worklist on visit id', () => {
    const [b, w] = toApi([row('a', 2, 40), row('b', 3, 30)])
    expect(joinBoard(b, w).map((i) => i.board.visit_id).sort()).toEqual(['a', 'b'])
  })

  it('leaves out a board row that has no worklist row yet', () => {
    const [b, w] = toApi([row('a', 2, 40), row('b', 3, 30)])
    expect(joinBoard(b, { ...w, rows: w.rows.filter((r) => r.visit.visit_id === 'a') })).toHaveLength(1)
  })

  it('orders by CTAS then arrival and ignores severity rank', () => {
    expect(order([row('late3', 3, 10), row('early3', 3, 50), row('two', 2, 5)])).toEqual(['two', 'early3', 'late3'])
  })

  it('a new flag changes the badge but never the row order', () => {
    const before = [row('a', 2, 40), row('b', 3, 50), row('c', 3, 20)]
    const after = [row('a', 2, 40), row('b', 3, 50), row('c', 3, 20, 'red')]
    expect(order(after)).toEqual(order(before))
  })

  it('derives condition from the latest check-in; an unanswered latest is unknown, not same', () => {
    const worse = { at: iso(5), pain: 3, feeling_now: 'poor' as const, feeling_change: 'worse' as const }
    expect(conditionOf(row('a', 2, 1, null, { trend: [worse] }).work)).toBe('worse')
    expect(conditionOf(row('a', 2, 1, null, { trend: [worse, { at: iso(1), pain: null, feeling_now: null, feeling_change: null }] }).work)).toBe('unknown')
    expect(conditionOf(row('a', 2, 1).work)).toBe('unknown')
    expect(feelingNowOf(row('a', 2, 1, null, { trend: [worse] }).work)).toBe('poor')
    expect(feelingNowOf(row('a', 2, 1).work)).toBeNull()
  })

  it.each(['much_worse', 'worse', 'same', 'better', 'much_better'] as const)('condition can be %s', (change) => {
    const point = { at: iso(1), pain: null, feeling_now: null, feeling_change: change }
    expect(conditionOf(row('a', 2, 1, null, { trend: [point] }).work)).toBe(change)
  })

  it('knows when the app is not offered', () => {
    expect(appNotOffered(row('a', 3, 1).work)).toBe(false)
    const excluded = row('a', 3, 1)
    excluded.work.visit.app_exclusion = 'child'
    expect(appNotOffered(excluded.work)).toBe(true)
  })

  it('counts by level and filters by level', () => {
    const [b, w] = toApi([row('a', 2, 40, 'red'), row('b', 3, 30, 'amber'), row('c', 3, 20)])
    const items = sortQueue(joinBoard(b, w))
    expect(countByLevel(items)).toMatchObject({ red: 1, amber: 1, silent: 0 })
    expect(applyFilters(items, NO_FILTERS)).toHaveLength(3)
    expect(applyFilters(items, { ...NO_FILTERS, level: 'amber' }).map((i) => i.board.visit_id)).toEqual(['b'])
  })

  it('column filters are "any of" within a column and "and" across columns', () => {
    const [b, w] = toApi([row('a', 2, 40, 'red'), row('b', 3, 30, 'amber'), row('c', 4, 20)])
    b.rows[2]!.complaint_group = 'head_injury'
    const items = sortQueue(joinBoard(b, w))
    const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(items, f).map((i) => i.board.visit_id)
    let f = toggleChoice(NO_FILTERS, 'ctas', '2')
    f = toggleChoice(f, 'ctas', '4')
    expect(ids(f)).toEqual(['a', 'c'])
    expect(ids(toggleChoice(f, 'complaint', 'general'))).toEqual(['a'])
    // Turning a choice off again removes it; an empty column is not a filter.
    expect(activeColumns(toggleChoice(toggleChoice(NO_FILTERS, 'ctas', '2'), 'ctas', '2'))).toEqual([])
    expect(isFiltered(NO_FILTERS)).toBe(false)
    expect(isFiltered(f)).toBe(true)
    expect(isFiltered({ ...NO_FILTERS, level: 'red' })).toBe(true)
  })

  it('a row matches each flag its chips show, and "none" only when it shows none', () => {
    const quiet = row('q', 3, 1)
    const silent = row('s', 3, 1, null, { prompt_overdue: true, leave_risk: true })
    const overdue = { ...row('o', 3, 1, 'amber'), board: { ...row('o', 3, 1, 'amber').board, reassess_overdue: true } }
    const excluded = row('x', 3, 1, null, { silent: true })
    excluded.work.visit.app_exclusion = 'child'
    expect(columnValues('flags', quiet)).toEqual(['none'])
    expect(columnValues('flags', silent).sort()).toEqual(['leave_risk', 'silent'])
    expect(columnValues('flags', overdue).sort()).toEqual(['amber', 'overdue'])
    // An excluded patient is watched by staff, never "No response".
    expect(columnValues('flags', excluded)).toEqual(['app_not_offered'])
    expect(columnValues('ref', excluded)).toEqual(['no_app'])
    expect(columnValues('ref', quiet)).toEqual(['none'])
    expect(columnValues('lastCheckin', quiet)).toEqual(['none'])
    expect(columnValues('condition', quiet)).toEqual(['unknown'])
    expect(countChoices([quiet, silent, excluded], 'flags')).toMatchObject({ none: 1, silent: 1, leave_risk: 1, app_not_offered: 1, red: 0 })
  })

  it('sorts manually without changing queue order', () => {
    const [b, w] = toApi([row('a', 2, 10), row('b', 3, 50), row('c', 3, 20)])
    const queue = sortQueue(joinBoard(b, w))
    expect(sortRows(queue, 'place')).toBe(queue)
    expect(sortRows(queue, 'waiting').map((i) => i.board.visit_id)).toEqual(['b', 'c', 'a'])
    expect(queue.map((i) => i.board.visit_id)).toEqual(['a', 'b', 'c'])
  })
})
