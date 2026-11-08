import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getTriageBoard, getWorklist } from '@/api/api'
import type { TaskLevel } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { InfoTip } from '@/components/InfoTip'
import { LevelChip } from '@/components/LevelChip'
import { CHIP, LEVEL_STYLE } from '@/components/levelStyle'
import { Sparkline } from '@/components/Sparkline'
import { StateChip } from '@/components/StateChip'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { optionLabel } from '@/api/bank'
import { ArrowDown, Plus, UserRoundCheck, X } from 'lucide-react'
import {
  FILTER_OPTIONS,
  LEVEL_ORDER,
  NO_FILTERS,
  activeColumns,
  appNotOffered,
  applyFilters,
  conditionOf,
  countByLevel,
  countChoices,
  isFiltered,
  joinBoard,
  sortQueue,
  sortRows,
  toggleChoice,
  visitRef,
  type BoardItem,
  type BoardSort,
  type Condition,
  type FilterColumn,
  type Filters,
} from '@/lib/board'
import { usePageTitle } from '@/lib/page'
import { formatMinutes, sinceMs, useNow } from '@/lib/time'
import { cn } from '@/lib/utils'
import { ColumnFilter } from './ColumnFilter'
import { ENROL_HEADING_ID, Enrol } from './Enrol'
import { Sheet } from './Sheet'
import { SiteSettingsCard } from './SiteSettings'
import { useDashboardEvents } from './useDashboardEvents'

/** `?panel=new-visit` opens the New visit sheet over the board. `/staff/visits/new` redirects there. */
const NEW_VISIT_PARAM = 'panel'
const NEW_VISIT_VALUE = 'new-visit'
const NEW_VISIT_BUTTON_ID = 'new-visit-button'

/**
 * Fixed column widths (table-layout: fixed), so filtering or sorting never
 * changes a column's width. They add up to the table's minimum width, which fits
 * the board's 1296px content width at 1440px with room for a scrollbar, so no
 * chip or pill has to wrap.
 */
const COLUMNS: { key: string; width: number; numeric?: boolean; sort?: BoardSort; filter?: FilterColumn }[] = [
  { key: 'place', width: 76, numeric: true, sort: 'place' },
  { key: 'ref', width: 144, filter: 'ref' },
  { key: 'ctas', width: 68, numeric: true, filter: 'ctas' },
  { key: 'complaint', width: 116, filter: 'complaint' },
  { key: 'waiting', width: 80, numeric: true, sort: 'waiting' },
  { key: 'condition', width: 148, filter: 'condition' },
  { key: 'flags', width: 164, filter: 'flags' },
  { key: 'lastCheckin', width: 136, filter: 'lastCheckin' },
  { key: 'nextCheckin', width: 144, numeric: true, sort: 'nextCheckin' },
  { key: 'reassess', width: 132, numeric: true, sort: 'reassess' },
  { key: 'pain', width: 72 },
]
const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0)

/** Level cards: one row from 1024px; below that Red and Amber take the wider slots, so no card sits alone. */
const CARD_SPAN: Record<TaskLevel, string> = {
  red: 'col-span-2 sm:col-span-3 lg:col-span-1',
  amber: 'sm:col-span-3 lg:col-span-1',
  silent: 'sm:col-span-2 lg:col-span-1',
  leave_risk: 'sm:col-span-2 lg:col-span-1',
  overdue: 'sm:col-span-2 lg:col-span-1',
}

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
  // Keeps the board fresh (events, with a 5 second poll as the fallback).
  const { live } = useDashboardEvents()
  const { data, isPending, isError } = useBoard()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  // True when this page pushed the sheet's history entry, so closing can step back instead of adding another.
  const pushed = useRef(false)
  const sheetOpen = params.get(NEW_VISIT_PARAM) === NEW_VISIT_VALUE
  // The sheet names the tab while it is open; closing it gives the board its title back.
  usePageTitle(sheetOpen ? null : t('pages.triage'))

  function openSheet() {
    pushed.current = true
    setParams({ [NEW_VISIT_PARAM]: NEW_VISIT_VALUE }, { preventScrollReset: true })
  }
  function closeSheet() {
    if (pushed.current) {
      pushed.current = false
      void navigate(-1)
    } else setParams({}, { replace: true, preventScrollReset: true })
  }

  const sheet = sheetOpen && (
    <Sheet labelledBy={ENROL_HEADING_ID} closeLabel={t('enrol.close')} onClose={closeSheet} returnFocus={() => document.getElementById(NEW_VISIT_BUTTON_ID)}>
      <Enrol />
    </Sheet>
  )

  const heading = (
    <header className="page-heading board-heading">
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1>{t('pages.triage')}</h1>
          {/* Shown only while offline; the board keeps refreshing in the background. */}
          <span role="status">
            {!live && (
              <span className="inline-flex items-center gap-2 rounded-full bg-level-amber-bg px-3 py-1 text-note font-semibold text-level-amber">
                <span aria-hidden className="size-2 rounded-full bg-level-amber" />
                {t('triage.reconnecting')}
              </span>
            )}
          </span>
        </div>
        <p>{t('triage.order')}</p>
      </div>
      <div className="board-heading-action">
        <Button id={NEW_VISIT_BUTTON_ID} aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={openSheet}>
          <Plus aria-hidden className="size-5" />
          {t('triage.newVisit')}
        </Button>
      </div>
    </header>
  )

  // The sheet stays in one place in the tree, so loading or a failed refresh never resets the form inside it.
  return (
    <>
      {isPending || isError ? (
        <main id="main-content" className="staff-page staff-page-wide board">
          {heading}
          {isPending ? <p>{t('common.loading')}</p> : <p className="font-semibold text-level-red" role="alert">{t('triage.failed')}</p>}
        </main>
      ) : (
        <Board data={data} heading={heading} />
      )}
      {sheet}
    </>
  )
}

/** The loaded board: level cards, the filtered and sorted table, and site settings. */
function Board({ data, heading }: { data: BoardItem[]; heading: ReactNode }) {
  const { t } = useTranslation()
  const now = useNow()
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<BoardSort>('place')

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

  const ordered = sortQueue(data)
  // The place in line is the patient's position in the full queue, so filtering or sorting never renumbers it.
  const place = new Map(ordered.map((item, i) => [item.board.visit_id, i + 1]))
  const rows = sortRows(applyFilters(ordered, filters), sort)
  const counts = countByLevel(ordered)
  const filtered = isFiltered(filters)

  const optionText = (col: FilterColumn, value: string): string => {
    switch (col) {
      case 'ref':
        return t(`triage.option.ref.${value}`)
      case 'ctas':
        return t('triage.filter.ctasValue', { n: value })
      case 'complaint':
        return t(`complaint.${value}`)
      case 'condition':
        return value === 'unknown' ? t('condition.unknown') : optionLabel('feeling_change', value)
      case 'lastCheckin':
        return t(`triage.option.lastCheckin.${value}`)
      case 'flags':
        if (value === 'app_not_offered') return t('flags.appNotOfferedShort')
        if (value === 'none') return t('triage.option.flagsNone')
        return t(`level.${value}`)
    }
  }
  // Menus show the same chips as the rows, so a choice looks like what it finds.
  const optionView = (col: FilterColumn, value: string): ReactNode => {
    if (col === 'condition') return <StateChip condition={value as Condition} />
    if (col === 'flags' && LEVEL_ORDER.includes(value as TaskLevel)) return <LevelChip level={value as TaskLevel} />
    if (col === 'flags' && value === 'app_not_offered') {
      return (
        <span className={cn(CHIP, 'border border-answer bg-surface text-ink')}>
          <UserRoundCheck aria-hidden />
          {optionText(col, value)}
        </span>
      )
    }
    return optionText(col, value)
  }
  // "Patient signed in" says its column already; other chips name theirs, such as "Complaint: Head injury".
  const chipLabel = (col: FilterColumn, value: string) =>
    col === 'ref' || col === 'ctas' ? optionText(col, value) : t('triage.filter.chip', { column: t(`triage.col.${col}`), value: optionText(col, value) })

  const activeChips: { key: string; label: string; remove: () => void }[] = [
    ...(filters.level
      ? [{ key: 'level', label: t('triage.filter.chip', { column: t('triage.filter.level'), value: t(`level.${filters.level}`) }), remove: () => setFilters({ ...filters, level: null }) }]
      : []),
    ...activeColumns(filters).flatMap((col) =>
      filters.columns[col]!.map((value) => ({
        key: `${col}-${value}`,
        label: chipLabel(col, value),
        remove: () => setFilters((f) => toggleChoice(f, col, value)),
      })),
    ),
  ]

  return (
    <main id="main-content" className="staff-page staff-page-wide board">
      {heading}

      <section aria-labelledby="board-levels">
        <h2 id="board-levels" className="sr-only">{t('triage.counts')}</h2>
        <ul className="level-cards">
          {LEVEL_ORDER.map((level: TaskLevel) => {
            const on = filters.level === level
            return (
              // The info button sits over the card, not inside its button; its tooltip hangs below the whole card.
              <li key={level} className={cn('relative grid', CARD_SPAN[level])}>
                <button
                  type="button"
                  aria-pressed={on}
                  title={t('triage.levelFilter', { level: t(`level.${level}`) })}
                  onClick={() => setFilters({ ...filters, level: on ? null : level })}
                  className="level-card [grid-area:1/1]"
                >
                  <LevelChip level={level} />{' '}
                  <span className="level-card-count tabular">{counts[level]}</span>
                </button>
                <span className="z-10 m-2 self-start justify-self-end [grid-area:1/1]">
                  <InfoTip label={t('triage.levelInfo', { level: t(`level.${level}`) })}>
                    <span className="block leading-tight font-semibold">{t(`triage.levelHelp.${level}.title`)}</span>
                    <span className="mt-1 block space-y-0.5">
                      {(['what', 'then'] as const).map((part) => (
                        <span key={part} className="flex gap-1.5">
                          <span aria-hidden className="text-white/60">•</span>
                          <span>{t(`triage.levelHelp.${level}.${part}`)}</span>
                        </span>
                      ))}
                    </span>
                    <span className="mt-1.5 block border-t border-white/15 pt-1.5 text-white/65">{t('triage.levelCount')}</span>
                  </InfoTip>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="board-table">
        <Card className="overflow-clip p-0">
          <div className="board-toolbar">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id="board-table" className="text-lead font-semibold tracking-tight">{t('triage.tableHeading')}</h2>
              <p className="text-small text-muted" role="status">
                {filtered ? t('triage.showing', { shown: rows.length, total: ordered.length }) : t('triage.total', { count: ordered.length })}
              </p>
            </div>
            {filtered && (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <ul className="contents" aria-label={t('triage.filter.active')}>
                  {activeChips.map((chip) => (
                    <li key={chip.key}>
                      <button type="button" className="filter-chip" aria-label={t('triage.filter.remove', { label: chip.label })} onClick={chip.remove}>
                        {chip.label}
                        <X aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button variant="ghost" className="min-h-8 px-2 text-small" onClick={() => setFilters(NO_FILTERS)}>
                  {t('triage.filter.clear')}
                </Button>
              </div>
            )}
          </div>
          <div ref={scrollBox} data-filtered={filtered} className="table-scroll board-scroll" tabIndex={0} role="region" aria-labelledby="board-table">
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
                      className={cn('board-th eyebrow', c.numeric && 'text-right')}
                    >
                      {c.sort ? (
                        <button
                          type="button"
                          onClick={() => setSort(sort === c.sort && c.sort !== 'place' ? 'place' : c.sort!)}
                          className={cn('column-sort', sort === c.sort && 'is-active')}
                        >
                          {t(`triage.col.${c.key}`)}
                          <ArrowDown aria-hidden className={cn('size-[1.1em]', sort === c.sort ? 'opacity-100' : 'opacity-0')} />
                        </button>
                      ) : c.filter ? (
                        <ColumnFilter
                          label={t(`triage.col.${c.key}`)}
                          options={FILTER_OPTIONS[c.filter]}
                          selected={filters.columns[c.filter] ?? []}
                          counts={countChoices(ordered, c.filter)}
                          renderOption={(v) => optionView(c.filter!, v)}
                          onToggle={(v) => setFilters((f) => toggleChoice(f, c.filter!, v))}
                          onClear={() => setFilters((f) => ({ ...f, columns: { ...f.columns, [c.filter!]: [] } }))}
                          align={c.numeric ? 'end' : 'start'}
                        />
                      ) : (
                        <span className="inline-flex min-h-7 items-center">{t(`triage.col.${c.key}`)}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-1.5 py-10 text-center text-muted">
                      {t('triage.empty')}{' '}
                      {filtered && (
                        <button type="button" className="font-semibold text-brand-600 hover:underline underline-offset-4" onClick={() => setFilters(NO_FILTERS)}>
                          {t('triage.filter.clear')}
                        </button>
                      )}
                    </td>
                  </tr>
                )}
                {rows.map((item) => (
                  <Row key={item.board.visit_id} item={item} place={place.get(item.board.visit_id)!} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {sort !== 'place' && (
          <p className="mt-3 text-small text-muted">
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
    <tr onClick={open} className="board-row">
      {/* The place in line. It is queue order only and never changes when a flag arrives. A flag adds a bar in its colour. */}
      <th
        scope="row"
        className="tabular pr-1.5 pl-5 text-right text-title font-semibold tracking-tight text-muted"
        style={board.level ? { boxShadow: `inset 4px 0 0 ${LEVEL_STYLE[board.level].bar}` } : undefined}
      >
        <span className="sr-only">{t('triage.col.place')} </span>
        {place}
      </th>
      <td>
        <Link to={to} className="inline-flex min-h-6 items-center font-semibold text-brand-600 hover:underline underline-offset-4">
          {visitRef(work)}
        </Link>
        {work.visit.pager_no && <div className="whitespace-nowrap text-muted">{t('visit.pager', { pager: work.visit.pager_no })}</div>}
        {!excluded && <div className="whitespace-nowrap text-muted">{t(`signedIn.short.${work.visit.signed_in_as ?? 'none'}`)}</div>}
      </td>
      <td className="tabular text-right">{board.ctas}</td>
      <td>{t(`complaint.${board.complaint_group}`)}</td>
      <td className="tabular text-right whitespace-nowrap">{formatMinutes(now - Date.parse(board.triaged_at))}</td>
      <td><StateChip condition={conditionOf(work)} /></td>
      <td>
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
      <td>
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
      <td className="text-right">
        {excluded ? <span className="text-muted">{t('time.notApplicable')}</span> : <CountdownChip due={work.visit.next_prompt_due_at} now={now} />}
      </td>
      <td className="text-right"><CountdownChip due={board.staff_reassess_due_at} now={now} /></td>
      <td className="pr-5"><Sparkline trend={work.trend} width={56} /></td>
    </tr>
  )
}
