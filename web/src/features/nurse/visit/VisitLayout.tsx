import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CircleAlert, CircleCheck, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getVisitDetail } from '@/api/api'
import type { Task } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { PageState } from '@/components/PageState'
import { usePageTitle } from '@/lib/page'
import { getPrimaryTaskReason } from '@/lib/taskLabels'
import { clock, isOverdue, untilMs, useNow } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useStaff } from '../staff'
import { useDashboardEvents } from '../useDashboardEvents'
import { LEVEL_TONE, lastAssessed, reasonText, type VisitContext } from './model'

/** /staff/visits/:id and its four pages. Owns the visit query and everything that stays on screen between pages. */
export function VisitLayout() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { role } = useStaff()
  useDashboardEvents()
  const now = useNow()
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['visit', id],
    queryFn: () => getVisitDetail(id),
    retry: false,
  })
  // Mirrors the API's role checks (routes/actions.py, routes/visits.py).
  const isDesk = role === 'triage_nurse' || role === 'charge_nurse'
  const canFlag = role === 'triage_nurse'
  const task = data?.open_task ?? null
  const { pathname } = useLocation()
  const completedTitle = useRef<HTMLHeadingElement>(null)
  const focusCompletion = useRef(false)
  // The task this page just assessed, so the result can name its outcome.
  const [completed, setCompleted] = useState<Task | null>(null)

  useEffect(() => {
    if (!task && focusCompletion.current && completedTitle.current) {
      completedTitle.current.focus()
      focusCompletion.current = false
    }
  }, [task])

  const visitName = data
    ? data.visit.pager_no ? t('visit.pager', { pager: data.visit.pager_no }) : t('visit.title', { ref: data.visit.visit_id.slice(0, 4) })
    : null
  const page = pathname.replace(/\/$/, '').split('/')[4]
  const tabName = t(page === 'assessment' || page === 'timeline' || page === 'manage' ? `visitTabs.${page}` : 'visitTabs.overview')
  usePageTitle(visitName ? `${visitName} · ${tabName}` : t('pages.visit'))

  const [backTo, backLabel] = role === 'physician'
    ? ['/staff/physician', t('visit.backToReview')]
    : role === 'charge_nurse' ? ['/staff/escalations', t('visit.backToEscalations')] : ['/staff/triage', t('visit.back')]
  const back = (
    <Link to={backTo} className="back-link mb-0!">
      <ArrowLeft aria-hidden size={18} />
      {backLabel}
    </Link>
  )

  if (!data) {
    return (
      <main id="main-content" className="staff-page">
        {back}
        <PageState
          loading={isPending}
          title={isPending ? t('common.loading') : t('visit.failed')}
          retry={isError ? () => void refetch() : undefined}
        />
      </main>
    )
  }

  const { visit } = data
  const context: VisitContext = {
    detail: data,
    stale: isError,
    role,
    isDesk,
    canFlag,
    canAct: !!role && !!task?.routed_to.includes(role),
    canAcknowledge: isDesk || (!!role && !!task?.routed_to.includes(role)),
    now,
    completed,
    onComplete: (done) => {
      focusCompletion.current = true
      setCompleted(done)
    },
  }
  const tabs = [
    { to: '', label: t('visitTabs.overview'), end: true },
    { to: 'assessment', label: t('visitTabs.assessment') },
    { to: 'timeline', label: t('visitTabs.timeline') },
    ...(isDesk ? [{ to: 'manage', label: t('visitTabs.manage') }] : []),
  ]

  return (
    <main id="main-content">
      <section className="border-b border-line bg-surface" aria-labelledby="visit-title">
        <div className="mx-auto max-w-[1280px] px-4 pt-3 pb-5 sm:px-8">
          {back}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 id="visit-title" className="text-heading font-semibold">
              {visitName}
            </h1>
            <span className="rounded-data bg-canvas px-2.5 py-1 font-semibold">
              {t('visitPage.initialCtas', { ctas: visit.ctas })}
            </span>
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-lead font-medium">{t(`complaint.${visit.complaint_group}`)}</span>
              {visit.cedis_code && (
                <span className="tabular text-small text-muted">{t('visitPage.cedis', { code: visit.cedis_code })}</span>
              )}
            </p>
            {visit.app_exclusion && (
              <span className="inline-flex items-center gap-1.5 rounded-data bg-level-overdue-bg px-2.5 py-1 text-small font-semibold text-level-overdue">
                <Smartphone aria-hidden className="size-4" />
                {t('visitPage.appNotOffered', { reason: t(`exclusion.${visit.app_exclusion}`) })}
              </span>
            )}
            <span className="ms-auto rounded-data border border-line px-3 py-1 font-semibold">{t(`visitStatus.${visit.status}`)}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        {isError && (
          <p role="status" className="mt-4 rounded-data border border-line bg-surface p-3">{t('visit.stale')}</p>
        )}

        {/*
          Below desktop width the two clocks share a row under the concern, so the tabs stay
          near the top. Desktop: concern and both clocks on one row.
        */}
        <div className="grid grid-cols-2 gap-3 py-4 sm:gap-4 [&>:first-child]:col-span-2 lg:grid-cols-[minmax(0,1fr)_16.5rem_15.5rem] lg:[&>:first-child]:col-span-1">
          {task ? (
            <ConcernBanner task={task} />
          ) : (
            <section aria-live="polite" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-data border border-line bg-surface p-4">
              <CircleCheck aria-hidden size={20} className="shrink-0" />
              <h2 ref={completedTitle} tabIndex={-1} className="min-w-0 flex-1 text-lead font-semibold">
                <AssessedSummary detail={data} completed={completed} />
              </h2>
              {lastAssessed(data) && (
                <Link to={backTo} className="font-medium text-brand-600 hover:underline">{backLabel}</Link>
              )}
            </section>
          )}
          <Clock
            highlight
            due={visit.staff_reassess_due_at}
            now={now}
            label={t('visitPage.staffClock')}
            note={visit.last_staff_check_at ? t('visitPage.lastStaffCheck', { time: clock(visit.last_staff_check_at) }) : t('visitPage.noStaffCheck')}
          />
          <Clock
            label={t('visitPage.patientClock')}
            due={visit.app_exclusion ? null : visit.next_prompt_due_at}
            now={now}
            empty={visit.app_exclusion ? t('time.notApplicable') : undefined}
            note={t('visitPage.separateClock')}
            noteWide
          />
        </div>

        <nav aria-label={t('visitTabs.label')} className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2">
            {tabs.map((tab) => (
              <li key={tab.to} className="shrink-0">
                <NavLink to={tab.to} end={tab.end} className={({ isActive }) => cn('visit-tab', isActive && 'is-active')}>
                  {tab.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-5 py-6">
          <Outlet context={context} />
        </div>
      </div>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-5 text-note text-muted sm:px-8">
          <p>{t('visitPage.boundaryRecord')}</p>
          <p>{t('visitPage.boundaryScope')}</p>
        </div>
      </footer>
    </main>
  )
}

/** The open concern stays on every page until it is assessed. */
function ConcernBanner({ task }: { task: Task }) {
  const { t } = useTranslation()
  const reason = getPrimaryTaskReason(task)
  return (
    <section aria-labelledby="active-concern" className={cn('flex items-center gap-3 rounded-data border border-l-4 p-3 sm:p-4', LEVEL_TONE[task.level])}>
      <CircleAlert aria-hidden size={20} className="shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="text-small font-bold">
          {t('visitPage.unresolved', { level: t(`taskLevel.${task.level}`) })}
        </p>
        <h2 id="active-concern" className="text-title font-semibold text-ink">
          {reason ? reasonText(reason.reason_code, t) : t('actions.task')}
        </h2>
        <p className="text-note sm:text-small">
          {task.status === 'open' ? t('visitPage.ackPending') : t('visitPage.ackDone', { time: clock(task.acknowledged_at ?? task.created_at) })}
          {' · '}
          {t('visitPage.assessPending')}
          {task.escalated && <> · {t('visit.routedToBackup')}</>}
        </p>
      </div>
    </section>
  )
}

/**
 * One of the two independent clocks. Overdue gets the overdue style, its hourglass and a
 * warm edge. The staff clock keeps a blue edge only while it is not overdue.
 */
function Clock({ label, due, now, empty, note, noteWide, highlight }: {
  label: string
  due: string | null
  now: number
  /** Shown instead of a countdown, e.g. "Not applicable". */
  empty?: string
  note: string
  /** Only on wider screens, where there is room for it. */
  noteWide?: boolean
  highlight?: boolean
}) {
  const overdue = !empty && isOverdue(untilMs(due, now))
  return (
    <div
      className={cn(
        'min-w-0 rounded-data border bg-surface px-3 py-2.5 sm:px-4',
        overdue ? 'border-level-amber' : highlight ? 'border-brand-500' : 'border-line',
      )}
    >
      <p className="text-small font-semibold">{label}</p>
      <p className="text-lead font-bold sm:text-title">
        {empty ?? <CountdownChip due={due} now={now} className="whitespace-normal" />}
      </p>
      <p className={cn('text-note text-muted sm:text-small', noteWide && 'hidden sm:block')}>{note}</p>
    </div>
  )
}

/** "Assessed, stable · 12:13 AM · Physician" once the task is done; the outcome is known only on this page load. */
function AssessedSummary({ detail, completed }: { detail: VisitContext['detail']; completed: Task | null }) {
  const { t } = useTranslation()
  const event = lastAssessed(detail)
  if (!event) return t('visit.noTask')
  const done = completed && completed.task_id === event.task_id ? completed : null
  return [
    done?.disposition ? t(`disposition.${done.disposition}`) : t('visit.assessmentRecorded'),
    clock(event.at),
    event.by ? t(`role.${event.by.role}`) : null,
  ].filter(Boolean).join(' · ')
}
