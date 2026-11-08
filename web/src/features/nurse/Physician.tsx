import { useQuery } from '@tanstack/react-query'
import { ArrowRight, RefreshCw, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getWorklist } from '@/api/api'
import { LevelChip } from '@/components/LevelChip'
import { PageState } from '@/components/PageState'
import { Button } from '@/components/ui/button'
import { shortRef } from '@/lib/board'
import { clock, formatMinutes, isDueNow, useNow } from '@/lib/time'
import { usePageTitle } from '@/lib/page'
import { getPrimaryTaskReason } from '@/lib/taskLabels'
import { cn } from '@/lib/utils'
import { TaskStatus } from './TaskStatus'
import { useDashboardEvents } from './useDashboardEvents'

export function Physician() {
  const { t } = useTranslation()
  const now = useNow()
  const { live } = useDashboardEvents()
  const query = useQuery({ queryKey: ['worklist'], queryFn: getWorklist, retry: false })
  const [filter, setFilter] = useState<'all' | 'open' | 'acknowledged'>('all')
  const [search, setSearch] = useState('')
  usePageTitle(t('review.title'))
  const active = [...(query.data?.rows ?? [])]
    .sort((a, b) => a.rank - b.rank)
    .flatMap((row) => {
      const task = row.open_task
      if (!task || task.status === 'completed' || !task.routed_to.includes('physician')) return []
      const reason = getPrimaryTaskReason(task)
      const label = reason ? t(`reason.${reason.reason_code}`, { defaultValue: reason.reason_code.replaceAll('_', ' ') }) : t(`taskLevel.${task.level}`)
      return [{ row, task, reason, label }]
    })
  const term = search.trim().toLocaleLowerCase()
  const rows = active.filter(({ row, task, label }) =>
    (filter === 'all' || task.status === filter) &&
    [shortRef(row), t(`complaint.${row.visit.complaint_group}`), label]
      .join(' ').toLocaleLowerCase().includes(term),
  )
  const filters = ['all', 'open', 'acknowledged'] as const
  const duration = (delta: number) =>
    isDueNow(delta) ? t('review.dueNow') : t(delta < 0 ? 'review.overdueBy' : 'review.dueIn', { time: formatMinutes(delta) })
  const clearSearch = () => {
    setSearch('')
    document.getElementById('worklist-search')?.focus()
  }

  return (
    <main id="main-content" className="staff-page">
      <header className="page-heading">
        <div>
          <h1>{t('review.title')}</h1>
          {query.data && (
            <p role="status">
              {t(query.isError ? 'review.stale' : live ? 'review.updated' : 'review.offline', {
                time: clock(query.data.generated_at),
              })}
            </p>
          )}
        </div>
        <Button variant="secondary" aria-label={t('review.refresh')} disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw aria-hidden className={cn('size-[1em]', query.isFetching && 'animate-spin')} />
          <span className="hidden sm:inline">{t('review.refresh')}</span>
        </Button>
      </header>
      <section className="review-surface" aria-label={t('review.title')}>
        <div className="list-toolbar">
          <div className="filter-group" role="group" aria-label={t('review.filter')}>
            {filters.map((value) => (
              <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {t(`review.filters.${value}`)}
                {query.data && <span className="ml-1.5 tabular-nums text-muted">
                  {value === 'all' ? active.length : active.filter(({ task }) => task.status === value).length}
                </span>}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search aria-hidden className="size-[1.1em]" />
            <span className="sr-only">{t('review.search')}</span>
            <input id="worklist-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('review.search')} />
          </label>
        </div>
        {!query.data ? (
          <PageState
            loading={query.isPending}
            title={t(query.isPending ? 'review.loading' : 'review.failed')}
            retry={query.isError ? () => void query.refetch() : undefined}
          />
        ) : rows.length === 0 ? (
          <PageState
            title={t(term ? 'review.noMatch' : `review.empty.${filter}`)}
            action={term ? (
              <Button variant="secondary" onClick={clearSearch}>
                <X aria-hidden className="size-[1em]" />
                {t('review.clearSearch')}
              </Button>
            ) : undefined}
          />
        ) : (
          <ul className="review-list" aria-label={t('review.tasks')}>
            {rows.map(({ row, task, reason, label }) => {
              const id = row.visit.visit_id
              const ref = shortRef(row)
              const staffDelta = row.visit.staff_reassess_due_at ? Date.parse(row.visit.staff_reassess_due_at) - now : null
              return (
                <li key={id}>
                  <Link className="review-row" to={`/staff/visits/${id}`} aria-labelledby={`reason-${id} ref-${id}`}>
                    <div className="concern-cell">
                      <LevelChip level={task.level} />
                      <h2 id={`reason-${id}`}>{label}</h2>
                      <p>
                        <strong id={`ref-${id}`}>{ref}</strong> · {t(`complaint.${row.visit.complaint_group}`)} · CTAS {row.visit.ctas} · {clock(reason?.fired_at ?? task.created_at)}
                      </p>
                    </div>
                    <div className="review-status">
                      <TaskStatus task={task} now={now} />
                      {staffDelta !== null && <p>{t('review.staffDue', { timing: duration(staffDelta) })}</p>}
                    </div>
                    <ArrowRight aria-hidden className="row-arrow size-[1.125rem] rtl:-scale-x-100" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
