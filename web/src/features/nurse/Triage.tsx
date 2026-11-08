import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getTriageBoard, getWorklist } from '@/api/api'
import type { ComplaintGroup, TaskLevel } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { LevelChip } from '@/components/LevelChip'
import { Sparkline } from '@/components/Sparkline'
import { StateChip } from '@/components/StateChip'
import { Card } from '@/components/ui/card'
import {
  LEVEL_ORDER,
  applyFilters,
  conditionOf,
  countByLevel,
  joinBoard,
  shortRef,
  sortQueue,
  type BoardItem,
  type Filters,
} from '@/lib/board'
import { formatMinutes, sinceMs, useNow } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useDashboardEvents } from './useDashboardEvents'

const COMPLAINTS: ComplaintGroup[] = ['chest_back_pain', 'neuro_change', 'head_injury', 'general']
const SELECT = 'min-h-11 rounded-lg border border-line bg-surface px-3'
const pill = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold'

/** The board data is TriageBoard joined with Worklist on visit id, sorted client side. */
export function useBoard() {
  return useQuery({
    queryKey: ['board'],
    queryFn: async () => {
      const [board, worklist] = await Promise.all([getTriageBoard(), getWorklist()])
      return joinBoard(board, worklist)
    },
  })
}

export function Triage() {
  const { t } = useTranslation()
  const { live } = useDashboardEvents()
  const { data, isPending, isError } = useBoard()
  const now = useNow()
  const [filters, setFilters] = useState<Filters>({ needsReview: false, ctas: null, complaint: null })

  if (isPending) return <main className="p-6">{t('common.loading')}</main>
  if (isError) return <main className="p-6 font-semibold text-level-red" role="alert">{t('triage.failed')}</main>

  const ordered = sortQueue(data)
  const rows = applyFilters(ordered, filters)
  const counts = countByLevel(ordered)

  return (
    <main className="mx-auto max-w-[88rem] space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t('pages.triage')}</h1>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted" role="status">
          <span aria-hidden className={cn('size-2.5 rounded-full', live ? 'bg-brand-600' : 'bg-level-amber')} />
          {live ? t('triage.live') : t('triage.reconnecting')}
        </span>
      </div>

      <ul className="flex flex-wrap gap-3" aria-label={t('triage.counts')}>
        {LEVEL_ORDER.map((level: TaskLevel) => (
          <li key={level}>
            <Card className="flex items-center gap-3 px-4 py-3">
              <LevelChip level={level} />
              <span className="tabular text-2xl font-bold">{counts[level]}</span>
            </Card>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 font-semibold">
          <input type="checkbox" checked={filters.needsReview} onChange={(e) => setFilters({ ...filters, needsReview: e.target.checked })} className="size-4" />
          {t('triage.needsReview')}
        </label>
        <label className="flex items-center gap-2">
          <span className="font-semibold">{t('triage.ctas')}</span>
          <select className={SELECT} value={filters.ctas ?? ''} onChange={(e) => setFilters({ ...filters, ctas: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{t('triage.all')}</option>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="font-semibold">{t('triage.complaint')}</span>
          <select className={SELECT} value={filters.complaint ?? ''} onChange={(e) => setFilters({ ...filters, complaint: e.target.value || null })}>
            <option value="">{t('triage.all')}</option>
            {COMPLAINTS.map((c) => (
              <option key={c} value={c}>{t(`complaint.${c}`)}</option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-sm text-muted">{t('triage.order')}</span>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[68rem] border-collapse text-left text-sm">
          <caption className="sr-only">{t('triage.caption')}</caption>
          <thead className="bg-slate-50 text-muted">
            <tr>
              {['ref', 'ctas', 'complaint', 'waiting', 'condition', 'flags', 'lastCheckin', 'nextCheckin', 'reassess', 'pain'].map((c) => (
                <th key={c} scope="col" className="px-3 py-3 font-semibold">{t(`triage.col.${c}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">{t('triage.empty')}</td></tr>
            )}
            {rows.map((item) => (
              <Row key={item.board.visit_id} item={item} now={now} />
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  )
}

function Row({ item, now }: { item: BoardItem; now: number }) {
  const { t } = useTranslation()
  const { board, work } = item
  const since = sinceMs(work.last_report?.at ?? null, now)
  const flagged = board.level !== null
  return (
    <tr className={cn('border-t border-line align-middle', flagged && 'bg-level-amber-bg/40')}>
      <td className="px-3 py-3 font-semibold">
        <Link to={`/staff/visits/${board.visit_id}`} className="text-brand-700 underline">
          {shortRef(work)}
        </Link>
      </td>
      <td className="tabular px-3 py-3">{board.ctas}</td>
      <td className="px-3 py-3">{t(`complaint.${board.complaint_group}`)}</td>
      <td className="tabular px-3 py-3 whitespace-nowrap">{formatMinutes(now - Date.parse(board.triaged_at))}</td>
      <td className="px-3 py-3"><StateChip condition={conditionOf(work)} /></td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          {board.level && <LevelChip level={board.level} />}
          {(work.silent || work.prompt_overdue) && board.level !== 'silent' && (
            <span className={cn(pill, 'bg-level-silent-bg text-level-silent')}>{t('flags.noResponse')}</span>
          )}
          {work.leave_risk && board.level !== 'leave_risk' && (
            <span className={cn(pill, 'bg-level-leave-bg text-level-leave')}>{t('level.leave_risk')}</span>
          )}
          {board.reassess_overdue && (
            <span className={cn(pill, 'bg-level-overdue-bg text-level-overdue')}>{t('flags.reassessOverdue')}</span>
          )}
          {!board.level && !work.silent && !work.prompt_overdue && !work.leave_risk && !board.reassess_overdue && (
            <span className="text-muted">{t('common.none')}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        {work.last_report && since !== null ? (
          <>
            <span className="tabular">{t('time.ago', { value: formatMinutes(since) })}</span>
            <span className="block text-muted">
              {t(`reporter.${work.last_report.reporter}`)}, {t(`channel.${work.last_report.channel}`)}
            </span>
          </>
        ) : (
          <span className="text-muted">{t('triage.noCheckin')}</span>
        )}
      </td>
      <td className="px-3 py-3"><CountdownChip due={work.visit.next_prompt_due_at} now={now} /></td>
      <td className="px-3 py-3"><CountdownChip due={board.staff_reassess_due_at} now={now} /></td>
      <td className="px-3 py-3"><Sparkline trend={work.trend} /></td>
    </tr>
  )
}
