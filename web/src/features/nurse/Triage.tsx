import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { cloneElement, isValidElement, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
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
import { ArrowDown, ArrowDownUp, ArrowUp, ChevronsLeftRight, Eye, EyeOff, Plus, UserRoundCheck, X } from 'lucide-react'
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
import { twoLineWidth } from '@/lib/columnWidths'
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

type ColumnKey = 'place' | 'ref' | 'ctas' | 'complaint' | 'waiting' | 'condition' | 'flags' | 'lastCheckin' | 'nextCheckin' | 'reassess' | 'pain'
type Column = {
  width: number
  resize?: { min: number; max: number }
  collapsible?: boolean
  sort?: BoardSort
  filter?: FilterColumn
}
const COLUMNS: Record<ColumnKey, Column> = {
  place: { width: 62, sort: 'place' },
  ref: { width: 134, resize: { min: 122, max: 220 }, filter: 'ref' },
  ctas: { width: 66, filter: 'ctas' },
  complaint: { width: 130, resize: { min: 106, max: 250 }, filter: 'complaint', collapsible: true },
  waiting: { width: 88, sort: 'waiting' },
  condition: { width: 156, filter: 'condition' },
  flags: { width: 196, resize: { min: 168, max: 360 }, filter: 'flags' },
  reassess: { width: 152, sort: 'reassess' },
  lastCheckin: { width: 132, resize: { min: 132, max: 240 }, filter: 'lastCheckin', collapsible: true },
  nextCheckin: { width: 152, sort: 'nextCheckin' },
  pain: { width: 56, collapsible: true },
}
const DEFAULT_COLUMNS = Object.keys(COLUMNS) as ColumnKey[]
// Old widths were tied to viewport size and could represent implicitly collapsed columns.
const WIDTHS_KEY = 'recheck-triage-widths-v2'
const COLLAPSED_WIDTH = 36
type ColumnWidths = Partial<Record<ColumnKey, number>>

function clampWidth(width: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(width)))
}

function savedWidths(): ColumnWidths {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? 'null')
    if (saved && typeof saved === 'object') {
      const values = saved as Record<string, unknown>
      return Object.fromEntries(DEFAULT_COLUMNS.flatMap((key) => {
        const width = values[key]
        const column = COLUMNS[key]
        if (column.collapsible && width === COLLAPSED_WIDTH) return [[key, width]]
        if (column.resize && typeof width === 'number' && Number.isFinite(width)) {
          return [[key, clampWidth(width, column.resize.min, column.resize.max)]]
        }
        return []
      }))
    }
  } catch { /* use default widths */ }
  return {}
}
const COLUMNS_KEY = 'recheck-triage-columns-v1'
const SETTINGS_TITLE = 'triage-settings-title'

function savedColumns(): ColumnKey[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null')
    if (Array.isArray(saved) && saved.length === DEFAULT_COLUMNS.length &&
        DEFAULT_COLUMNS.every((key) => saved.includes(key))) {
      return [...(saved as ColumnKey[]).filter((key) => key !== 'pain'), 'pain']
    }
  } catch { /* use default order */ }
  return DEFAULT_COLUMNS
}

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
  const settingsOpen = params.get(NEW_VISIT_PARAM) === 'settings'
  const [widths, setWidths] = useState(savedWidths)

  function saveWidths(next: ColumnWidths) {
    setWidths(next)
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(next)) } catch { /* keep in-memory widths */ }
  }
  const [columnOrder, setColumnOrder] = useState(savedColumns)

  function saveColumns(order: ColumnKey[]) {
    setColumnOrder(order)
    try { localStorage.setItem(COLUMNS_KEY, JSON.stringify(order)) } catch { /* use in-memory order */ }
  }

  function moveColumn(index: number, offset: number) {
    const next = [...columnOrder]
    const target = index + offset
    if (target < 0 || target >= next.length - 1 || next[index] === 'pain') return
    const [column] = next.splice(index, 1)
    if (!column) return
    next.splice(target, 0, column)
    saveColumns(next)
  }

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
      <Enrol onClose={closeSheet} />
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
      <div className="board-heading-action flex items-center gap-2">
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
        <Board data={data} heading={heading} columnOrder={columnOrder} widths={widths} onWidthsChange={setWidths} onWidthsSave={saveWidths} />
      )}
      {sheet}
      {settingsOpen && (
        <Sheet labelledBy={SETTINGS_TITLE} closeLabel={t('enrol.close')} onClose={() => { const next = new URLSearchParams(params); next.delete(NEW_VISIT_PARAM); setParams(next, { replace: true, preventScrollReset: true }) }} returnFocus={() => document.getElementById('staff-menu-button')}>
          <div className="space-y-5 p-5">
            <h2 id={SETTINGS_TITLE} className="text-heading font-semibold">{t('triage.settings')}</h2>
            <section aria-labelledby="triage-columns">
              <div className="flex items-center justify-between gap-2">
                <h3 id="triage-columns" className="text-title font-semibold">{t('triage.columns')}</h3>
                <Button variant="ghost" onClick={() => { saveColumns(DEFAULT_COLUMNS); saveWidths({}) }}>{t('triage.resetColumns')}</Button>
              </div>
              <p className="text-small text-muted">{t('triage.columnHelp')}</p>
              <ol className="mt-2 divide-y divide-line">
                {columnOrder.map((key, index) => {
                  const name = t(`triage.col.${key}`)
                  const collapsed = widths[key] === COLLAPSED_WIDTH
                  const visibility = t(collapsed ? 'triage.showColumn' : 'triage.hideColumn', { name })
                  return (
                    <li key={key} className="flex items-center justify-between gap-2">
                      <span>{name}</span>
                      <div className="flex">
                        {COLUMNS[key].collapsible && (
                          <Button variant="ghost" aria-label={visibility} title={visibility}
                            onClick={() => saveWidths({ ...widths, [key]: collapsed ? undefined : COLLAPSED_WIDTH })}>
                            {collapsed ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                          </Button>
                        )}
                        {key !== 'pain' && (
                          <>
                            <Button variant="ghost" aria-disabled={index === 0} className="aria-disabled:opacity-40" aria-label={t('triage.moveEarlier', { name })} onClick={() => moveColumn(index, -1)}><ArrowUp aria-hidden className="size-4" /></Button>
                            <Button variant="ghost" aria-disabled={index === columnOrder.length - 2} className="aria-disabled:opacity-40" aria-label={t('triage.moveLater', { name })} onClick={() => moveColumn(index, 1)}><ArrowDown aria-hidden className="size-4" /></Button>
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
            <SiteSettingsCard />
          </div>
        </Sheet>
      )}
    </>
  )
}

/** The loaded board: level cards and the filtered, sorted table. */
function Board({ data, heading, columnOrder, widths, onWidthsChange, onWidthsSave }: {
  data: BoardItem[]
  heading: ReactNode
  columnOrder: ColumnKey[]
  widths: ColumnWidths
  onWidthsChange: (widths: ColumnWidths) => void
  onWidthsSave: (widths: ColumnWidths) => void
}) {
  const { t } = useTranslation()
  const now = useNow()
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sorting, setSorting] = useState<{ by: BoardSort; reversed: boolean }>({ by: 'place', reversed: false })
  const { by: sort, reversed } = sorting
  const table = useRef<HTMLTableElement>(null)
  const restoreFocus = useRef<ColumnKey | null>(null)
  const columns = columnOrder.map((key) => ({ key, ...COLUMNS[key], width: widths[key] ?? COLUMNS[key].width }))
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0)

  useLayoutEffect(() => {
    if (!restoreFocus.current) return
    const header = table.current?.querySelector<HTMLElement>(`th[data-column="${restoreFocus.current}"]`)
    const control = header?.querySelector<HTMLElement>('button, [role="separator"]') ?? header
    control?.focus({ preventScroll: true })
    restoreFocus.current = null
  }, [widths])

  function saveColumnFit(key: ColumnKey, restoreHeaderFocus = false) {
    if (restoreHeaderFocus) restoreFocus.current = key
    const column = COLUMNS[key]
    if (column.resize && table.current) {
      const measured = measureColumn(table.current, columnOrder.indexOf(key), key === 'flags')
      const width = clampWidth(measured || column.width, column.resize.min, column.resize.max)
      onWidthsSave({ ...widths, [key]: width })
    } else if (widths[key] === COLLAPSED_WIDTH) {
      onWidthsSave({ ...widths, [key]: undefined })
    }
  }
  const direction = (sort === 'waiting') !== reversed ? 'descending' : 'ascending'
  const SortIcon = direction === 'descending' ? ArrowDown : ArrowUp

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
  const rows = sortRows(applyFilters(ordered, filters), sort, reversed)
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
          <div ref={scrollBox} data-filtered={filtered} className="table-scroll board-scroll"
            style={{ scrollPaddingInlineEnd: widths.pain ?? COLUMNS.pain.width }}
            tabIndex={0} role="region" aria-labelledby="board-table">
            <table ref={table} className="table-fixed border-collapse text-center text-small" style={{ width: `max(100%, ${tableWidth}px)` }}>
              <caption className="sr-only">{t('triage.caption')}</caption>
              <colgroup>
                {columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}
              </colgroup>
              <thead className="text-muted">
                <tr>
                  {columns.map((c) => {
                    const collapsed = c.width === COLLAPSED_WIDTH
                    const name = t(`triage.col.${c.key}`)
                    const expandLabel = t('triage.expandColumn', { name })
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        tabIndex={c.key === 'pain' && !collapsed ? -1 : undefined}
                        aria-label={collapsed ? name : undefined}
                        aria-sort={c.sort && sort === c.sort ? direction : undefined}
                        className="board-th eyebrow"
                        data-column={c.key}
                        data-collapsed={collapsed || undefined}
                        data-resizable={!!c.resize || undefined}
                        onClick={(event) => {
                          if (!(event.target as Element).closest('button, [role="separator"]')) saveColumnFit(c.key)
                        }}
                      >
                        {collapsed && (
                          <button type="button" className="board-expand-column" title={expandLabel}
                            aria-label={expandLabel} onClick={() => saveColumnFit(c.key, true)}>
                            <ChevronsLeftRight aria-hidden className="size-3.5" />
                          </button>
                        )}
                        <div className="board-cell-content" hidden={collapsed}>
                          {c.sort ? (
                            <button
                              type="button"
                              onClick={() => setSorting({ by: c.sort!, reversed: sort === c.sort && !reversed })}
                              className={cn('column-sort', sort === c.sort && 'is-active')}
                            >
                              {name}
                              {sort === c.sort ? <SortIcon aria-hidden className="size-3 shrink-0" /> : <ArrowDownUp aria-hidden className="size-3 shrink-0 text-muted" />}
                            </button>
                          ) : c.filter ? (
                            <ColumnFilter
                              label={name}
                              options={FILTER_OPTIONS[c.filter]}
                              selected={filters.columns[c.filter] ?? []}
                              counts={countChoices(ordered, c.filter)}
                              renderOption={(v) => optionView(c.filter!, v)}
                              onToggle={(v) => setFilters((f) => toggleChoice(f, c.filter!, v))}
                              onClear={() => setFilters((f) => ({ ...f, columns: { ...f.columns, [c.filter!]: [] } }))}
                            />
                          ) : (
                            <span className="inline-flex min-h-7 items-center">{name}</span>
                          )}
                        </div>
                        {!collapsed && c.resize && <ColumnResize
                          label={t('triage.resizeColumn', { name })}
                          width={c.width}
                          minimum={c.resize.min}
                          maximum={c.resize.max}
                          onFit={() => saveColumnFit(c.key)}
                          onResize={(width) => onWidthsChange({ ...widths, [c.key]: width })}
                          onSave={(width) => onWidthsSave({ ...widths, [c.key]: width })}
                        />}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="px-1.5 py-10 text-center text-muted">
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
                  <Row key={item.board.visit_id} item={item} place={place.get(item.board.visit_id)!} now={now} columnOrder={columnOrder} widths={widths} onFit={saveColumnFit} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {(sort !== 'place' || reversed) && (
          <p className="mt-3 text-small text-muted">
            {t('triage.sortedBy', { column: t(`triage.col.${sort}`) })}{' '}
            <button type="button" className="font-semibold text-brand-600 hover:underline underline-offset-4" onClick={() => setSorting({ by: 'place', reversed: false })}>
              {t('triage.sortReset')}
            </button>
          </p>
        )}
      </section>

    </main>
  )
}

function Row({ item, place, now, columnOrder, widths, onFit }: {
  item: BoardItem; place: number; now: number; columnOrder: ColumnKey[]
  widths: ColumnWidths
  onFit: (key: ColumnKey) => void
}) {
  const { t } = useTranslation()
  const { board, work } = item
  const since = sinceMs(work.last_report?.at ?? null, now)
  const excluded = appNotOffered(work)
  const to = `/staff/visits/${board.visit_id}`

  function fitCell(event: MouseEvent<HTMLTableRowElement>) {
    const target = event.target as Element
    if (target.closest('a, button, input, select, summary') || window.getSelection()?.toString()) return
    const cell = target.closest<HTMLTableCellElement>('td, th')
    if (cell?.parentElement === event.currentTarget) onFit(columnOrder[cell.cellIndex]!)
  }

  const cells: Record<ColumnKey, ReactNode> = {
    place: (<th
        scope="row"
        className="tabular text-title font-semibold tracking-tight text-muted"
      >
        <span className="sr-only">{t('triage.col.place')} </span>
        {place}
      </th>),
    ref: (<td>
        <Link to={to} state={{ from: '/staff/triage' }} className="inline-flex min-h-6 items-center font-semibold text-brand-600 hover:underline underline-offset-4">
          {visitRef(work)}
        </Link>
        {work.visit.pager_no && <div className="text-muted">{t('visit.pager', { pager: work.visit.pager_no })}</div>}
        {!excluded && <div className="text-muted">{t(`signedIn.short.${work.visit.signed_in_as ?? 'none'}`)}</div>}
      </td>),
    ctas: (<td className="tabular">{board.ctas}</td>),
    complaint: (<td>{t(`complaint.${board.complaint_group}`)}</td>),
    waiting: (<td className="tabular">{formatMinutes(now - Date.parse(board.triaged_at))}</td>),
    condition: (<td><StateChip condition={conditionOf(work)} /></td>),
    flags: (<td>
        <div className="board-flags flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
          {board.level && <LevelChip level={board.level} />}
          {excluded && (
            <span className={cn(CHIP, 'border border-answer bg-surface text-ink')}>
              <UserRoundCheck aria-hidden />
              {t('flags.appNotOfferedShort')}
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
        {excluded && <p className="mt-1 text-muted">{t(`exclusion.${work.visit.app_exclusion}`)}</p>}
      </td>),
    lastCheckin: (<td>
        {work.last_report && since !== null ? (
          <>
            <span className="tabular whitespace-nowrap">{t('time.ago', { value: formatMinutes(since) })}</span>
            <span className="block text-muted">
              {t(`reporter.${work.last_report.reporter}`)}, {t(`channel.${work.last_report.channel}`)}
            </span>
          </>
        ) : (
          <span className="text-muted">{excluded ? t('triage.noApp') : t('triage.noCheckin')}</span>
        )}
      </td>),
    nextCheckin: (<td>
        {excluded ? <span className="text-muted">{t('time.notApplicable')}</span> : <CountdownChip due={work.visit.next_prompt_due_at} now={now} />}
      </td>),
    reassess: (<td><CountdownChip due={board.staff_reassess_due_at} now={now} /></td>),
    pain: (<td><Sparkline trend={work.trend} width={42} /></td>),
  }
  return (
    <tr
      onClick={fitCell}
      className="board-row"
      style={board.level ? { '--board-row-accent': LEVEL_STYLE[board.level].bar } as CSSProperties : undefined}
    >
      {columnOrder.map((key) => {
        const cell = cells[key]
        if (!isValidElement<{ children?: ReactNode; 'data-column': ColumnKey; 'data-collapsed'?: boolean; 'data-resizable'?: boolean }>(cell)) return null
        return cloneElement(cell, {
          key,
          'data-column': key,
          'data-collapsed': widths[key] === COLLAPSED_WIDTH || undefined,
          'data-resizable': !!COLUMNS[key].resize || undefined,
        },
          <div className="board-cell-content" hidden={widths[key] === COLLAPSED_WIDTH}>{cell.props.children}</div>,
        )
      })}
    </tr>
  )
}

function ColumnResize({ label, width, minimum, maximum, onFit, onResize, onSave }: {
  label: string
  width: number
  minimum: number
  maximum: number
  onFit: () => void
  onResize: (width: number) => void
  onSave: (width: number) => void
}) {
  const drag = useRef<{ start: number; width: number; current: number; direction: number; moved: boolean } | null>(null)
  const lastTap = useRef(-Infinity)
  return (
    <span
      className="column-resize"
      role="separator"
      tabIndex={0}
      aria-label={label}
      title={label}
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={width}
      onDoubleClick={(event) => { event.stopPropagation(); onFit() }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        const direction = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1
        drag.current = { start: event.clientX, width, current: width, direction, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
        const state = drag.current
        const delta = (event.clientX - state.start) * state.direction
        if (!state.moved && Math.abs(delta) < 3) return
        state.moved = true
        const next = clampWidth(state.width + delta, minimum, maximum)
        if (next === state.current) return
        state.current = next
        onResize(next)
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== 'touch' || drag.current?.moved) {
          lastTap.current = -Infinity
          return
        }
        if (event.timeStamp - lastTap.current < 350) {
          lastTap.current = -Infinity
          onFit()
        } else {
          lastTap.current = event.timeStamp
        }
      }}
      onLostPointerCapture={() => {
        if (!drag.current) return
        const { current, width: initial } = drag.current
        drag.current = null
        if (current !== initial) onSave(current)
      }}
      onKeyDown={(event) => {
        const direction = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1
        if (event.key === 'Enter') {
          event.preventDefault()
          onFit()
          return
        }
        const offset = event.key === 'ArrowRight' ? 8 : event.key === 'ArrowLeft' ? -8 : 0
        if (!offset) return
        event.preventDefault()
        onSave(clampWidth(width + offset * direction, minimum, maximum))
      }}
    />
  )
}

/** Measure one column at natural width. Flags fit the chips into at most two lines. */
function measureColumn(table: HTMLTableElement, index: number, fitFlags: boolean): number {
  const probe = table.cloneNode(true) as HTMLTableElement
  probe.removeAttribute('id')
  probe.setAttribute('aria-hidden', 'true')
  probe.inert = true
  probe.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
  probe.querySelectorAll('colgroup, caption, .column-resize, .board-expand-column, [role=menu], [colspan]').forEach((element) => element.remove())
  probe.classList.add('board-width-probe')
  table.parentElement!.append(probe)
  try {
    let natural = 0
    for (const row of probe.rows) {
      const cell = row.cells[index]
      if (!cell) continue
      cell.removeAttribute('data-collapsed')
      const style = getComputedStyle(cell)
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const content = cell.querySelector<HTMLElement>('.board-cell-content')
      if (content) content.hidden = false
      const flags = fitFlags ? cell.querySelector('.board-flags') : null
      // The exclusion reason sits below the chips and can wrap independently.
      const width = flags?.children.length
        ? twoLineWidth(Array.from(flags.children, (child) => child.getBoundingClientRect().width),
            parseFloat(getComputedStyle(flags).columnGap) || 0)
        : content?.getBoundingClientRect().width ?? 0
      if (width > 0) natural = Math.max(natural, Math.ceil(width + padding))
    }
    return natural
  } finally {
    probe.remove()
  }
}
