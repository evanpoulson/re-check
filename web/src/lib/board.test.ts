import { describe, expect, it } from 'vitest'
import type { BoardRow, TriageBoard, Worklist, WorklistRow } from '@/api/types'
import { applyFilters, conditionOf, countByLevel, joinBoard, needsReview, sortQueue } from './board'

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
      channel: 'phone',
      pager_no: null,
      status: 'waiting',
      triaged_at: iso(triagedMinAgo),
      closed_at: null,
      next_prompt_due_at: iso(-10),
      staff_reassess_due_at: iso(-10),
      last_staff_check_at: null,
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
    const worse = { at: iso(5), pain: 3, overall: 'worse' as const }
    expect(conditionOf(row('a', 2, 1, null, { trend: [worse] }).work)).toBe('worse')
    expect(conditionOf(row('a', 2, 1, null, { trend: [worse, { at: iso(1), pain: null, overall: null }] }).work)).toBe('unknown')
    expect(conditionOf(row('a', 2, 1).work)).toBe('unknown')
  })

  it('counts by level and filters', () => {
    const [b, w] = toApi([row('a', 2, 40, 'red'), row('b', 3, 30, 'amber'), row('c', 3, 20)])
    const items = sortQueue(joinBoard(b, w))
    expect(countByLevel(items)).toMatchObject({ red: 1, amber: 1, silent: 0 })
    expect(applyFilters(items, { needsReview: true, ctas: null, complaint: null }).map((i) => i.board.visit_id)).toContain('a')
    expect(applyFilters(items, { needsReview: false, ctas: 3, complaint: null })).toHaveLength(2)
  })

  it('needs review for an overdue prompt or reassessment even without a task', () => {
    expect(needsReview(row('a', 3, 1, null, { prompt_overdue: true }))).toBe(true)
    const calm = row('a', 3, 1)
    expect(needsReview(calm)).toBe(false)
    expect(needsReview({ board: { ...calm.board, reassess_overdue: true }, work: calm.work })).toBe(true)
  })
})
