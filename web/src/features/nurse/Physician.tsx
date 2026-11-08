import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Clock3, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getWorklist } from '@/api/api'
import { PageState } from '@/components/PageState'
import { Button } from '@/components/ui/button'
import { shortRef } from '@/lib/board'
import { clock, formatMinutes, useNow } from '@/lib/time'
import { useDashboardEvents } from './useDashboardEvents'
import { taskLabel } from '@/lib/taskLabels'

export function Physician() {
  const { t } = useTranslation()
  const now = useNow()
  const { live } = useDashboardEvents()
  const query = useQuery({ queryKey: ['worklist'], queryFn: getWorklist, retry: false })
  const [filter, setFilter] = useState<'all' | 'open' | 'acknowledged'>('all')
  const [search, setSearch] = useState('')
  const active = (query.data?.rows ?? []).filter((r) => r.open_task).sort((a, b) => a.rank - b.rank)
  const urgent = active.filter((r) => r.open_task?.level === 'red').length
  const rows = active.filter(
    (r) =>
      (filter === 'all' || r.open_task?.status === filter) &&
      [
        shortRef(r),
        t(`complaint.${r.visit.complaint_group}`),
        ...r.open_task!.reasons.map((x) => t(`reason.${x.reason_code}`, { defaultValue: x.reason_code })),
      ]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  return (
    <main id="main-content" className="staff-page">
      <header className="page-heading">
        <div>
          <h1>Review worklist</h1>
          <p>Changes that need a clinician’s attention. Ordered by review priority.</p>
        </div>
        <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw size={16} aria-hidden className={query.isFetching ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </header>
      {query.data && (
        <section className="worklist-summary" aria-label="Review summary">
          <div className="summary-primary">
            <strong>{active.length}</strong>
            <span>active review {active.length === 1 ? 'task' : 'tasks'}</span>
          </div>
          <div className="summary-secondary">
            <span className="status-dot" />
            <strong>{urgent}</strong> urgent <span className="summary-divider" />
            {active.filter((r) => r.open_task?.status === 'open').length} awaiting acknowledgement
          </div>
          <span className="update-note">
            {live ? `Updated ${clock(query.data.generated_at)}` : 'Offline · updates paused'}
          </span>
        </section>
      )}
      <section className="review-surface" aria-label="Patient review worklist">
        <div className="list-toolbar">
          <div className="filter-group" aria-label="Task status">
            {(
              [
                ['all', 'All tasks'],
                ['open', 'Awaiting review'],
                ['acknowledged', 'Acknowledged'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={17} aria-hidden />
            <span className="sr-only">Search visits or concerns</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a visit or concern" />
          </label>
        </div>
        {query.isPending ? (
          <PageState loading title="Loading review tasks" body="Getting the latest reports and staff actions." />
        ) : query.isError ? (
          <PageState
            title="Worklist could not be updated"
            body="Try again to get the latest review tasks."
            retry={() => void query.refetch()}
          />
        ) : rows.length === 0 ? (
          <PageState
            title={
              search
                ? 'No matching visits'
                : filter === 'acknowledged'
                  ? 'No acknowledged tasks'
                  : filter === 'open'
                    ? 'No tasks awaiting review'
                    : 'No active review tasks'
            }
            body={
              search
                ? 'Try a visit reference, complaint or concern.'
                : 'New concerns will appear here. Staff reassessments continue on their own schedule.'
            }
          />
        ) : (
          <>
            <div className="worklist-columns" aria-hidden>
              <span>Concern / visit</span>
              <span>Review status</span>
              <span>Staff reassessment</span>
              <span />
            </div>
            <ul className="review-list" aria-label="Review tasks">
              {rows.map((row) => {
                const task = row.open_task!
                const reason = task.reasons.find((r) => r.level === task.level) ?? task.reasons[0]
                return (
                  <li key={row.visit.visit_id}>
                    <Link className="review-row" to={`/staff/visits/${row.visit.visit_id}`}>
                      <div className="concern-cell">
                        <span className={`task-label task-${task.level}`}>{taskLabel[task.level]}</span>
                        <h2>
                          {t(`reason.${reason.reason_code}`, { defaultValue: reason.reason_code.replaceAll('_', ' ') })}
                        </h2>
                        <p>
                          <strong>{shortRef(row)}</strong>
                          <span>·</span>
                          {t(`complaint.${row.visit.complaint_group}`)}
                          <span>·</span>Initial CTAS {row.visit.ctas}
                        </p>
                        <p className="report-meta">
                          {row.last_report
                            ? `${t(`reporter.${row.last_report.reporter}`)} report · ${clock(row.last_report.at)}`
                            : 'No patient report'}
                          {row.prompt_overdue ? ' · Patient check-in overdue' : ''}
                        </p>
                      </div>
                      <div className="review-status">
                        <span className={task.status === 'open' ? 'font-semibold' : ''}>
                          {task.status === 'open' ? 'Awaiting acknowledgement' : 'Acknowledged'}
                        </span>
                        <p>{task.routed_to.map((role) => t(`role.${role}`)).join(', ')}</p>
                        {task.escalated && <span className="text-level-amber">Backup notified</span>}
                        {task.status === 'open' && task.ack_due_at && (
                          <p className={Date.parse(task.ack_due_at) < now ? 'text-level-red' : ''}>
                            Acknowledge{' '}
                            {Date.parse(task.ack_due_at) < now
                              ? `${formatMinutes(now - Date.parse(task.ack_due_at))} overdue`
                              : `within ${formatMinutes(Date.parse(task.ack_due_at) - now)}`}
                          </p>
                        )}
                      </div>
                      <div className="review-timer">
                        <span className={row.reassess_overdue ? 'text-level-amber' : ''}>
                          <Clock3 size={15} aria-hidden />
                          {row.visit.staff_reassess_due_at
                            ? `${row.reassess_overdue ? 'Overdue by' : 'Due in'} ${formatMinutes(Date.parse(row.visit.staff_reassess_due_at) - now)}`
                            : 'Not scheduled'}
                        </span>
                        <p>Waiting {formatMinutes(now - Date.parse(row.visit.triaged_at))}</p>
                      </div>
                      <ArrowRight size={20} aria-hidden className="row-arrow" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
      <footer className="worklist-footer">
        <p>Review priority is separate from the clinical queue.</p>
        <Link to="/staff/triage">
          View triage board <ArrowRight size={15} aria-hidden />
        </Link>
      </footer>
    </main>
  )
}
