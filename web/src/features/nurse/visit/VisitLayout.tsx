import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CircleAlert } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getVisitDetail } from '@/api/api'
import type { Task } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { PageState } from '@/components/PageState'
import { usePageTitle } from '@/lib/page'
import { getPrimaryTaskReason } from '@/lib/taskLabels'
import { clock, useNow } from '@/lib/time'
import { cn } from '@/lib/utils'
import { useStaff } from '../staff'
import { useDashboardEvents } from '../useDashboardEvents'
import { LEVEL_TONE, reasonText, type VisitContext } from './model'

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
    onComplete: () => { focusCompletion.current = true },
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
            <h1 id="visit-title" className="text-[1.875rem] leading-tight font-semibold">
              {visitName}
            </h1>
            <span className="rounded-data bg-canvas px-2.5 py-1 font-semibold">
              {t('visitPage.initialCtas', { ctas: visit.ctas })}
            </span>
            <p className="min-w-40 flex-1 text-[1.1875rem] font-medium">{t(`complaint.${visit.complaint_group}`)}</p>
            {visit.cedis_code && (
              <span className="tabular text-muted">{t('visitPage.cedis', { code: visit.cedis_code })}</span>
            )}
            <span className="rounded-data border border-line px-3 py-1 font-semibold">{t(`visitStatus.${visit.status}`)}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        {isError && (
          <p role="status" className="mt-4 rounded-data border border-line bg-surface p-3">{t('visit.stale')}</p>
        )}

        {/* iPad widths: the concern spans the row and the two clocks sit side by side below it. */}
        <div className="grid gap-4 py-4 md:grid-cols-2 md:[&>:first-child]:col-span-2 lg:grid-cols-[minmax(0,1fr)_16.5rem_15.5rem] lg:[&>:first-child]:col-span-1">
          {task ? (
            <ConcernBanner task={task} />
          ) : (
            <section aria-live="polite" className="flex items-center rounded-data border border-line bg-surface p-4">
              <h2 ref={completedTitle} tabIndex={-1} className="text-[1.1875rem] font-semibold">
                {data.timeline.some((e) => 'event' in e && e.event === 'assessed') ? t('visit.assessmentRecorded') : t('visit.noTask')}
              </h2>
            </section>
          )}
          <Clock
            highlight
            label={t('visitPage.staffClock')}
            value={<CountdownChip due={visit.staff_reassess_due_at} now={now} />}
            note={visit.last_staff_check_at ? t('visitPage.lastStaffCheck', { time: clock(visit.last_staff_check_at) }) : t('visitPage.noStaffCheck')}
          />
          <Clock
            label={t('visitPage.patientClock')}
            value={visit.app_exclusion ? t('time.notApplicable') : <CountdownChip due={visit.next_prompt_due_at} now={now} />}
            note={t('visitPage.separateClock')}
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
        <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-5 text-sm text-muted sm:px-8">
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
    <section aria-labelledby="active-concern" className={cn('flex items-center gap-3 rounded-data border border-l-4 p-4', LEVEL_TONE[task.level])}>
      <CircleAlert aria-hidden size={20} className="shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="text-[0.9375rem] font-bold uppercase">
          {t('visitPage.unresolved', { level: t(`taskLevel.${task.level}`) })}
        </p>
        <h2 id="active-concern" className="text-[1.1875rem] leading-snug font-semibold text-ink">
          {reason ? reasonText(reason.reason_code, t) : t('actions.task')}
        </h2>
        <p className="text-sm">
          {task.status === 'open' ? t('visitPage.ackPending') : t('visitPage.ackDone', { time: clock(task.acknowledged_at ?? task.created_at) })}
          {' · '}
          {t('visitPage.assessPending')}
          {task.escalated && <> · {t('visit.routedToBackup')}</>}
        </p>
      </div>
    </section>
  )
}

function Clock({ label, value, note, highlight }: { label: string; value: React.ReactNode; note: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-data border bg-surface px-4 py-2.5', highlight ? 'border-brand-500' : 'border-line')}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted">{note}</p>
    </div>
  )
}
