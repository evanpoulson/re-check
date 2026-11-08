import { useQuery } from '@tanstack/react-query'
import { ArrowRight, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getWorklist } from '@/api/api'
import { PageState } from '@/components/PageState'
import { Button } from '@/components/ui/button'
import { shortRef } from '@/lib/board'
import { clock, formatMinutes, useNow } from '@/lib/time'
import { usePageTitle } from '@/lib/page'
import { getPrimaryTaskReason } from '@/lib/taskLabels'
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
  const duration = (delta: number) => t(delta < 0 ? 'review.overdueBy' : 'review.dueIn', { time: formatMinutes(delta) })

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
          <RefreshCw size={16} aria-hidden className={query.isFetching ? 'animate-spin' : ''} />
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
            <Search size={17} aria-hidden />
            <span className="sr-only">{t('review.search')}</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('review.search')} />
          </label>
        </div>
        {!query.data ? (
          <PageState
            loading={query.isPending}
            title={t(query.isPending ? 'review.loading' : 'review.failed')}
            retry={query.isError ? () => void query.refetch() : undefined}
          />
        ) : rows.length === 0 ? (
          <PageState title={t(term ? 'review.noMatch' : `review.empty.${filter}`)} />
        ) : (
          <ul className="review-list" aria-label={t('review.tasks')}>
            {rows.map(({ row, task, reason, label }) => {
              const id = row.visit.visit_id
              const ref = shortRef(row)
              const ackDelta = task.ack_due_at ? Date.parse(task.ack_due_at) - now : null
              const staffDelta = row.visit.staff_reassess_due_at ? Date.parse(row.visit.staff_reassess_due_at) - now : null
              return (
                <li key={id}>
                  <Link className="review-row" to={`/staff/visits/${id}`} aria-labelledby={`reason-${id} ref-${id}`}>
                    <div className="concern-cell">
                      {task.level === 'red' && <span className="task-label task-red">{t('review.urgent')}</span>}
                      <h2 id={`reason-${id}`}>{label}</h2>
                      <p>
                        <strong id={`ref-${id}`}>{ref}</strong> · {t(`complaint.${row.visit.complaint_group}`)} · CTAS {row.visit.ctas} · {clock(reason?.fired_at ?? task.created_at)}
                      </p>
                    </div>
                    <div className="review-status">
                      <span className={ackDelta !== null && ackDelta < 0 && task.status === 'open' ? 'text-level-red' : ''}>
                        {t(`review.filters.${task.status}`)}
                        {task.status === 'open' && ackDelta !== null ? ` · ${duration(ackDelta)}` : ''}
                      </span>
                      {staffDelta !== null && <p>{t('review.staffDue', { timing: duration(staffDelta) })}</p>}
                      {task.escalated && <p>{t('review.backup')}</p>}
                    </div>
                    <ArrowRight size={18} aria-hidden className="row-arrow" />
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
