import { useQuery } from '@tanstack/react-query'
import { ArrowRight, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getEscalations, getHandover } from '@/api/api'
import type { Handover, Task, VisitSummary, WorklistRow } from '@/api/types'
import { LevelChip } from '@/components/LevelChip'
import { PageState } from '@/components/PageState'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/lib/page'
import { getPrimaryTaskReason } from '@/lib/taskLabels'
import { clock, formatMinutes, isDueNow, useNow } from '@/lib/time'
import { cn } from '@/lib/utils'
import { TaskStatus } from './TaskStatus'
import { useDashboardEvents } from './useDashboardEvents'

const visitRef = (visit: Pick<VisitSummary, 'visit_id' | 'pager_no'> | undefined, visitId: string) =>
  visit?.pager_no ? `Pager ${visit.pager_no}` : `P-${visitId.slice(0, 4)}`

/**
 * /staff/escalations: the charge nurse's home. "Escalations" lists what reaches
 * the backup (GET /api/escalations); "Handover" is the shift template (GET /api/handover).
 * Both read the handover so a task row can show the patient's complaint and CTAS.
 */
export function Escalations() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const tab = pathname.replace(/\/$/, '').endsWith('/handover') ? 'handover' : 'escalations'
  const now = useNow()
  const { live } = useDashboardEvents()
  const escalations = useQuery({ queryKey: ['escalations'], queryFn: getEscalations, retry: false })
  const handover = useQuery({ queryKey: ['handover'], queryFn: getHandover, retry: false })
  const query = tab === 'handover' ? handover : escalations
  const title = t(`escalations.tabs.${tab}`)
  usePageTitle(title)

  const visits = new Map((handover.data?.patients ?? []).map((row) => [row.visit.visit_id, row]))
  const tabs = [
    { to: '/staff/escalations', key: 'escalations', end: true },
    { to: '/staff/escalations/handover', key: 'handover', end: false },
  ] as const

  return (
    <main id="main-content" className="staff-page">
      <header className="page-heading">
        <div>
          <h1>{title}</h1>
          {query.data && (
            <p role="status">
              {t(query.isError ? 'review.stale' : live ? 'review.updated' : 'review.offline', {
                time: clock(query.data.generated_at),
              })}
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          aria-label={t('review.refresh')}
          disabled={escalations.isFetching || handover.isFetching}
          onClick={() => {
            void escalations.refetch()
            void handover.refetch()
          }}
        >
          <RefreshCw aria-hidden className={cn('size-[1em]', query.isFetching && 'animate-spin')} />
          <span className="hidden sm:inline">{t('review.refresh')}</span>
        </Button>
      </header>

      <nav aria-label={t('escalations.tabsLabel')} className="-mx-1 mb-4 overflow-x-auto border-b border-line px-1">
        <ul className="flex gap-2">
          {tabs.map((item) => (
            <li key={item.key} className="shrink-0">
              <NavLink to={item.to} end={item.end} className={({ isActive }) => cn('visit-tab', isActive && 'is-active')}>
                {t(`escalations.tabs.${item.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {tab === 'escalations' ? (
        escalations.data ? (
          <EscalationList tasks={escalations.data.tasks} tlpOnDuty={escalations.data.tlp_on_duty} visits={visits} now={now} />
        ) : (
          <section className="review-surface">
            <PageState
              loading={escalations.isPending}
              title={t(escalations.isPending ? 'escalations.loading' : 'escalations.failed')}
              retry={escalations.isError ? () => void escalations.refetch() : undefined}
            />
          </section>
        )
      ) : handover.data ? (
        <HandoverView data={handover.data} now={now} />
      ) : (
        <section className="review-surface">
          <PageState
            loading={handover.isPending}
            title={t(handover.isPending ? 'handover.loading' : 'handover.failed')}
            retry={handover.isError ? () => void handover.refetch() : undefined}
          />
        </section>
      )}
    </main>
  )
}

function EscalationList({ tasks, tlpOnDuty, visits, now }: {
  tasks: Task[]
  tlpOnDuty: boolean
  visits: Map<string, WorklistRow>
  now: number
}) {
  const { t } = useTranslation()
  return (
    <>
      <p className="mb-4 text-small text-muted">
        {t(tlpOnDuty ? 'escalations.lead' : 'escalations.leadNoTlp')}
      </p>
      <section className="review-surface" aria-label={t('escalations.tabs.escalations')}>
        {tasks.length === 0 ? (
          <PageState title={t('escalations.empty')} body={t('escalations.emptyBody')} />
        ) : (
          <TaskList tasks={tasks} visits={visits} now={now} label={t('escalations.listLabel')} />
        )}
      </section>
    </>
  )
}

/** One row per task: level, reason, visit, routing, and where acknowledgement stands. */
function TaskList({ tasks, visits, now, label }: { tasks: Task[]; visits: Map<string, WorklistRow>; now: number; label: string }) {
  const { t } = useTranslation()
  return (
    <ul className="review-list" aria-label={label}>
      {tasks.map((task) => {
        const row = visits.get(task.visit_id)
        const ref = visitRef(row?.visit, task.visit_id)
        const reason = getPrimaryTaskReason(task)
        const id = task.task_id
        return (
          <li key={id}>
            <Link className="review-row" to={`/staff/visits/${task.visit_id}`} aria-labelledby={`esc-reason-${id} esc-ref-${id}`}>
              <div className="concern-cell">
                <LevelChip level={task.level} />
                <h2 id={`esc-reason-${id}`}>
                  {reason ? t(`reason.${reason.reason_code}`, { defaultValue: reason.reason_code.replaceAll('_', ' ') }) : t(`taskLevel.${task.level}`)}
                </h2>
                <p>
                  <strong id={`esc-ref-${id}`}>{ref}</strong>
                  {row && <> · {t(`complaint.${row.visit.complaint_group}`)} · CTAS {row.visit.ctas}</>}
                  {' · '}
                  {t('visit.routedTo', { roles: task.routed_to.map((r) => t(`role.${r}`)).join(', ') })}
                </p>
              </div>
              <div className="review-status">
                <TaskStatus task={task} now={now} />
                {task.status === 'open' && <p>{t('escalations.raised', { time: clock(task.created_at) })}</p>}
              </div>
              <ArrowRight aria-hidden className="row-arrow size-[1.125rem] rtl:-scale-x-100" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function HandoverView({ data, now }: { data: Handover; now: number }) {
  const { t } = useTranslation()
  const visits = new Map(data.patients.map((row) => [row.visit.visit_id, row]))
  const overdue = data.reassess_overdue.flatMap((id) => {
    const row = visits.get(id)
    return row ? [row] : []
  })

  return (
    <div className="space-y-6">
      <p className="text-lead">
        <span className="font-semibold">{t('handover.shift', { start: clock(data.shift_start), end: clock(data.shift_end) })}</span>
        <span className="text-muted"> · {t('handover.template')}</span>
      </p>

      <HandoverSection title={t('handover.patients')} count={data.patients.length}>
        {data.patients.length === 0 ? (
          <p role="status" className="px-5 py-4 text-muted">{t('handover.noPatients')}</p>
        ) : (
          <ul className="review-list" aria-label={t('handover.patients')}>
            {data.patients.map((row) => <PatientRow key={row.visit.visit_id} row={row} now={now} />)}
          </ul>
        )}
      </HandoverSection>

      <HandoverSection title={t('handover.openTasks')} count={data.open_tasks.length}>
        {data.open_tasks.length === 0 ? (
          <p role="status" className="px-5 py-4 text-muted">{t('handover.noTasks')}</p>
        ) : (
          <TaskList tasks={data.open_tasks} visits={visits} now={now} label={t('handover.openTasks')} />
        )}
      </HandoverSection>

      <HandoverSection title={t('handover.reassessOverdue')} count={overdue.length}>
        {overdue.length === 0 ? (
          <p role="status" className="px-5 py-4 text-muted">{t('handover.noReassess')}</p>
        ) : (
          <ul className="review-list" aria-label={t('handover.reassessOverdue')}>
            {overdue.map((row) => {
              const id = row.visit.visit_id
              const due = row.visit.staff_reassess_due_at
              return (
                <li key={id}>
                  <Link className="review-row" to={`/staff/visits/${id}`}>
                    <div className="concern-cell">
                      <h2>{visitRef(row.visit, id)}</h2>
                      <p>{t(`complaint.${row.visit.complaint_group}`)} · CTAS {row.visit.ctas}</p>
                    </div>
                    <div className="review-status">
                      <span className="font-semibold text-level-red">
                        {due ? t('review.staffDue', { timing: isDueNow(Date.parse(due) - now) ? t('review.dueNow') : t('review.overdueBy', { time: formatMinutes(Date.parse(due) - now) }) }) : null}
                      </span>
                      <p>
                        {row.visit.last_staff_check_at
                          ? t('visitPage.lastStaffCheck', { time: clock(row.visit.last_staff_check_at) })
                          : t('visitPage.noStaffCheck')}
                      </p>
                    </div>
                    <ArrowRight aria-hidden className="row-arrow size-[1.125rem] rtl:-scale-x-100" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </HandoverSection>
    </div>
  )
}

function HandoverSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const id = `handover-${title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 text-title font-semibold">
        {title} <span className="tabular-nums font-normal text-muted">({count})</span>
      </h2>
      <div className="review-surface">{children}</div>
    </section>
  )
}

/** A waiting patient in worklist rank: rank, visit, wait, open task level and what is overdue. */
function PatientRow({ row, now }: { row: WorklistRow; now: number }) {
  const { t } = useTranslation()
  const { visit } = row
  const id = visit.visit_id
  const task = row.open_task
  const ackLate = task?.status === 'open' && task.ack_due_at ? now - Date.parse(task.ack_due_at) : null
  const ackOverdue = ackLate !== null && ackLate > 0
  // Everything overdue, not just the first: acknowledgement, patient check-in, staff reassessment.
  const notes = [
    ackOverdue && (isDueNow(ackLate) ? t('handover.flags.ackDueNow') : t('handover.flags.ack', { time: formatMinutes(ackLate) })),
    row.silent ? t('handover.flags.silent') : row.prompt_overdue && t('handover.flags.prompt'),
    row.reassess_overdue && t('handover.flags.reassess'),
    row.leave_risk && t('handover.flags.leave'),
  ].filter(Boolean)
  const urgent = ackOverdue || row.reassess_overdue
  return (
    <li>
      <Link className="review-row" to={`/staff/visits/${id}`} aria-labelledby={`hp-ref-${id}`}>
        <div className="concern-cell">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums text-small font-semibold text-muted">#{row.rank}</span>
            {row.open_task ? <LevelChip level={row.open_task.level} /> : <span className="text-small text-muted">{t('handover.noTask')}</span>}
          </div>
          <h2 id={`hp-ref-${id}`}>{visitRef(visit, id)}</h2>
          <p>{t(`complaint.${visit.complaint_group}`)} · CTAS {visit.ctas} · {t('handover.waited', { time: formatMinutes(now - Date.parse(visit.triaged_at)) })}</p>
        </div>
        <div className="review-status">
          {notes.length ? (
            <span className={urgent ? 'font-semibold text-level-red' : ''}>{notes.join(' · ')}</span>
          ) : (
            <span className="text-muted">{t('handover.flags.none')}</span>
          )}
        </div>
        <ArrowRight aria-hidden className="row-arrow size-[1.125rem] rtl:-scale-x-100" />
      </Link>
    </li>
  )
}
