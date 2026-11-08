import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getTriageBoard, getWorklist } from '@/api/api'
import type { TaskLevel } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { LevelChip } from '@/components/LevelChip'
import { CHIP, LEVEL_STYLE } from '@/components/levelStyle'
import { Sparkline } from '@/components/Sparkline'
import { StateChip } from '@/components/StateChip'
import { ArrowDown, UserRoundCheck } from 'lucide-react'
import {
  LEVEL_ORDER,
  appNotOffered,
  applyFilters,
  conditionOf,
  countByLevel,
  joinBoard,
  sortQueue,
  sortRows,
  visitRef,
  type BoardItem,
  type BoardSort,
  type Filters,
} from '@/lib/board'
import { COMPLAINT_GROUPS as COMPLAINTS } from '@/lib/enrol'
import { usePageTitle } from '@/lib/page'
import { formatMinutes, sinceMs, useNow } from '@/lib/time'
import { cn } from '@/lib/utils'
import { SiteSettingsCard } from './SiteSettings'
import { useDashboardEvents } from './useDashboardEvents'

// A tap-to-filter toggle. Selected is the blue selection style, never a status colour.
const TOGGLE =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-tap border px-4 text-small font-medium transition-colors aria-pressed:border-brand-500 aria-pressed:bg-brand-50 aria-pressed:font-semibold aria-pressed:text-brand-700 border-answer bg-surface hover:border-ink'

/**
 * Fixed column widths (table-layout: fixed), so filtering or sorting never
 * changes a column's width. They add up to the table's minimum width, which fits
 * the board's 1296px content width at 1440px, so no chip or pill has to wrap.
 */
const COLUMNS: { key: string; width: number; numeric?: boolean; sort?: BoardSort }[] = [
  { key: 'place', width: 80, numeric: true, sort: 'place' },
  { key: 'ref', width: 144 },
  { key: 'ctas', width: 48, numeric: true },
  { key: 'complaint', width: 100 },
  { key: 'waiting', width: 84, numeric: true, sort: 'waiting' },
  { key: 'condition', width: 152 },
  { key: 'flags', width: 168 },
  { key: 'lastCheckin', width: 144 },
  { key: 'nextCheckin', width: 148, numeric: true, sort: 'nextCheckin' },
  { key: 'reassess', width: 140, numeric: true, sort: 'reassess' },
  { key: 'pain', width: 84 },
]
const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0)

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
  const [filters, setFilters] = useState<Filters>({ needsReview: false, ctas: null, complaint: null, level: null })
  const [sort, setSort] = useState<BoardSort>('place')
  usePageTitle(t('pages.triage'))
  // While filtered, the table keeps its full height, so the page and the filters don't jump under the pointer.
  const scrollBox = useRef<HTMLDivElement>(null)
  const fullHeight = useRef(0)
  useLayoutEffect(() => {
    const el = scrollBox.current
    if (!el) return
    if (el.dataset.filtered === 'true') {
      el.style.minHeight = `${fullHeight.current}px`
    } else {
      el.style.minHeight = ''
      fullHeight.current = el.offsetHeight
    }
  })

  if (isPending) return <main id="main-content" className="staff-page">{t('common.loading')}</main>
  if (isError) return <main id="main-content" className="staff-page font-semibold text-level-red" role="alert">{t('triage.failed')}</main>

  const ordered = sortQueue(data)
  // The place in line is the patient's position in the full queue, so filtering or sorting never renumbers it.
  const place = new Map(ordered.map((item, i) => [item.board.visit_id, i + 1]))
  const rows = sortRows(applyFilters(ordered, filters), sort)
  const counts = countByLevel(ordered)
  const filtered = rows.length !== ordered.length

  return (
    <main id="main-content" className="staff-page staff-page-wide space-y-5">
      <header className="page-heading">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1>{t('pages.triage')}</h1>
            <span className="inline-flex items-center gap-2 rounded-data bg-surface px-3 py-1.5 text-note text-muted shadow-card" role="status">
              <span aria-hidden className={cn('size-2 rounded-full', live ? 'bg-muted' : 'bg-level-amber')} />
              {live ? t('triage.live') : t('triage.reconnecting')}
            </span>
          </div>
          <p>{t('triage.order')}</p>
        </div>
      </header>

      <section aria-labelledby="board-filters" className="space-y-3">
        <h2 id="board-filters" className="sr-only">{t('triage.filters')}</h2>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(3.1rem,1fr))] gap-1.5 sm:flex sm:flex-wrap sm:gap-2" aria-label={t('triage.counts')}>
          {LEVEL_ORDER.map((level: TaskLevel) => {
            const { icon: Icon, cls } = LEVEL_STYLE[level]
            const on = filters.level === level
            return (
              <li key={level} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilters({ ...filters, level: on ? null : level })}
                  className={cn(TOGGLE, 'w-full flex-col gap-0.5 rounded-2xl px-1 py-1.5 sm:w-auto sm:rounded-tap sm:flex-row sm:py-0 sm:pr-4 sm:pl-1.5')}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 sm:px-2', cls)}>
                      <Icon aria-hidden className="size-[1.25em] shrink-0" />
                      <span className="hidden text-note font-semibold sm:inline">{t(`level.${level}`)}</span>
                    </span>
                    <span className="tabular font-semibold">{counts[level]}</span>
                  </span>
                  <span className="max-w-full text-center text-note leading-tight sm:hidden">{t(`level.${level}`)}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <button type="button" aria-pressed={filters.needsReview} onClick={() => setFilters({ ...filters, needsReview: !filters.needsReview })} className={TOGGLE}>
            {t('triage.needsReview')}
          </button>
          <div className="flex items-center gap-2">
            <span id="ctas-filter" className="text-small text-muted">{t('triage.ctas')}</span>
            <div className="filter-group flex-wrap" role="group" aria-labelledby="ctas-filter">
              {[null, 2, 3, 4, 5].map((n) => (
                <button key={n ?? 'all'} type="button" aria-pressed={filters.ctas === n} className="min-w-11" onClick={() => setFilters({ ...filters, ctas: n })}>
                  {n ?? t('triage.all')}
                </button>
              ))}
            </div>
          </div>
          <label className="flex min-w-0 max-w-full items-center gap-2">
            <span className="text-small text-muted">{t('triage.complaint')}</span>
            <select className="field select w-auto min-w-0 flex-1 sm:w-60 sm:flex-none" value={filters.complaint ?? ''} onChange={(e) => setFilters({ ...filters, complaint: e.target.value || null })}>
              <option value="">{t('triage.all')}</option>
              {COMPLAINTS.map((c) => (
                <option key={c} value={c}>{t(`complaint.${c}`)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section aria-labelledby="board-table" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="board-table" className="text-title font-semibold">{t('triage.tableHeading')}</h2>
          <p className="text-small text-muted" role="status">
            {filtered ? t('triage.showing', { shown: rows.length, total: ordered.length }) : t('triage.total', { count: ordered.length })}
          </p>
        </div>
        <div ref={scrollBox} data-filtered={filtered} className="table-scroll rounded-card shadow-card" tabIndex={0} role="region" aria-labelledby="board-table">
          <table className="w-full table-fixed border-collapse text-left text-small" style={{ minWidth: TABLE_WIDTH }}>
            <caption className="sr-only">{t('triage.caption')}</caption>
            <colgroup>
              {COLUMNS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
            </colgroup>
            <thead className="text-muted">
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={c.sort && sort === c.sort ? (c.sort === 'waiting' ? 'descending' : 'ascending') : undefined}
                    className={cn('eyebrow sticky top-0 z-10 border-b border-line bg-surface px-1.5 pt-3 pb-2 align-bottom first:pl-5 last:pr-5', c.numeric && 'text-right')}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => setSort(sort === c.sort && c.sort !== 'place' ? 'place' : c.sort!)}
                        className={cn('eyebrow inline-flex min-h-6 cursor-pointer items-center gap-1 rounded hover:text-ink', sort === c.sort && 'text-ink')}
                      >
                        {t(`triage.col.${c.key}`)}
                        <ArrowDown aria-hidden className={cn('size-[1.15em]', sort === c.sort ? 'opacity-100' : 'opacity-0')} />
                      </button>
                    ) : (
                      <span className="inline-flex min-h-6 items-center">{t(`triage.col.${c.key}`)}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-1.5 py-10 text-center text-muted">{t('triage.empty')}</td>
                </tr>
              )}
              {rows.map((item) => (
                <Row key={item.board.visit_id} item={item} place={place.get(item.board.visit_id)!} now={now} />
              ))}
            </tbody>
          </table>
        </div>
        {sort !== 'place' && (
          <p className="text-small text-muted">
            {t('triage.sortedBy', { column: t(`triage.col.${sort}`) })}{' '}
            <button type="button" className="font-semibold text-brand-600 hover:underline underline-offset-4" onClick={() => setSort('place')}>
              {t('triage.sortReset')}
            </button>
          </p>
        )}
      </section>

      <SiteSettingsCard />
    </main>
  )
}

function Row({ item, place, now }: { item: BoardItem; place: number; now: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { board, work } = item
  const since = sinceMs(work.last_report?.at ?? null, now)
  const excluded = appNotOffered(work)
  const to = `/staff/visits/${board.visit_id}`

  // The whole row opens the visit for a mouse. The reference stays a real link for keyboards and screen readers.
  function open(e: MouseEvent<HTMLTableRowElement>) {
    if ((e.target as HTMLElement).closest('a, button, input, select, summary')) return
    if (window.getSelection()?.toString()) return
    if (e.metaKey || e.ctrlKey) window.open(to, '_blank', 'noopener')
    else void navigate(to)
  }

  return (
    <tr onClick={open} className="cursor-pointer border-t border-line/70 align-middle transition-colors first:border-t-0 hover:bg-canvas">
      {/* The place in line. It is queue order only and never changes when a flag arrives. A flag adds a bar in its colour. */}
      <th
        scope="row"
        className="tabular py-4 pr-1.5 pl-5 text-right text-title font-semibold tracking-tight text-muted"
        style={board.level ? { boxShadow: `inset 4px 0 0 ${LEVEL_STYLE[board.level].bar}` } : undefined}
      >
        <span className="sr-only">{t('triage.col.place')} </span>
        {place}
      </th>
      <td className="px-1.5 py-4">
        <Link to={to} className="inline-flex min-h-6 items-center font-semibold text-brand-600 hover:underline underline-offset-4">
          {visitRef(work)}
        </Link>
        {work.visit.pager_no && <div className="whitespace-nowrap text-muted">{t('visit.pager', { pager: work.visit.pager_no })}</div>}
        {!excluded && <div className="whitespace-nowrap text-muted">{t(`signedIn.short.${work.visit.signed_in_as ?? 'none'}`)}</div>}
      </td>
      <td className="tabular px-1.5 py-4 text-right">{board.ctas}</td>
      <td className="px-1.5 py-4">{t(`complaint.${board.complaint_group}`)}</td>
      <td className="tabular px-1.5 py-4 text-right whitespace-nowrap">{formatMinutes(now - Date.parse(board.triaged_at))}</td>
      <td className="px-1.5 py-4"><StateChip condition={conditionOf(work)} /></td>
      <td className="px-1.5 py-4">
        <div className="flex flex-wrap gap-1.5">
          {board.level && <LevelChip level={board.level} />}
          {/* The chip never wraps; the reason sits under it as plain text. */}
          {excluded && (
            <span className="min-w-0">
              <span className={cn(CHIP, 'border border-answer bg-surface text-ink')}>
                <UserRoundCheck aria-hidden />
                {t('flags.appNotOfferedShort')}
              </span>
              <span className="mt-0.5 block text-muted">{t(`exclusion.${work.visit.app_exclusion}`)}</span>
            </span>
          )}
          {!excluded && (work.silent || work.prompt_overdue) && board.level !== 'silent' && (
            <LevelChip level="silent" label={t('flags.noResponse')} />
          )}
          {work.leave_risk && board.level !== 'leave_risk' && <LevelChip level="leave_risk" />}
          {board.reassess_overdue && <LevelChip level="overdue" label={t('flags.reassessOverdueShort')} />}
          {!excluded && !board.level && !work.silent && !work.prompt_overdue && !work.leave_risk && !board.reassess_overdue && (
            <span className="text-muted">{t('common.none')}</span>
          )}
        </div>
      </td>
      <td className="px-1.5 py-4">
        {work.last_report && since !== null ? (
          <>
            <span className="tabular whitespace-nowrap">{t('time.ago', { value: formatMinutes(since) })}</span>
            <span className="block whitespace-nowrap text-muted">
              {t(`reporter.${work.last_report.reporter}`)}, {t(`channel.${work.last_report.channel}`)}
            </span>
          </>
        ) : (
          <span className="text-muted">{excluded ? t('triage.noApp') : t('triage.noCheckin')}</span>
        )}
      </td>
      <td className="px-1.5 py-4 text-right">
        {excluded ? <span className="text-muted">{t('time.notApplicable')}</span> : <CountdownChip due={work.visit.next_prompt_due_at} now={now} />}
      </td>
      <td className="px-1.5 py-4 text-right"><CountdownChip due={board.staff_reassess_due_at} now={now} /></td>
      <td className="py-4 pr-5 pl-1.5"><Sparkline trend={work.trend} width={56} /></td>
    </tr>
  )
}
