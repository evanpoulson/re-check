import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getVisitDetail } from '@/api/api'
import { bankItems, text } from '@/api/bank'
import type { CheckinReport, Task, TimelineEntry } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { PageState } from '@/components/PageState'
import { Timeline } from '@/components/Timeline'
import { itemAnswerText } from '@/lib/answers'
import { signedInText } from '@/lib/session'
import { getPrimaryTaskReason } from '@/lib/taskLabels'
import { useNow } from '@/lib/time'
import { useStaff } from './staff'
import { useDashboardEvents } from './useDashboardEvents'
import { VisitActions, VisitTaskAction } from './VisitActions'

const stamp = (value: string) =>
  new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function VisitDetailPage() {
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
  const isNurse = role === 'triage_nurse'
  const back = isNurse ? '/staff/triage' : '/staff/physician'
  const task = data?.open_task
  const completedTitle = useRef<HTMLHeadingElement>(null)
  const focusCompletion = useRef(false)

  useEffect(() => {
    if (!task && focusCompletion.current && completedTitle.current) {
      completedTitle.current.focus()
      focusCompletion.current = false
    }
  }, [task])

  return (
    <main id="main-content" className="staff-page max-w-3xl">
      <Link to={back} className="back-link">
        <ChevronLeft aria-hidden size={16} />
        {isNurse ? t('visit.back') : t('visit.backToReview')}
      </Link>
      {!data ? (
        <PageState
          loading={isPending}
          title={isPending ? t('common.loading') : t('visit.failed')}
          retry={isError ? () => void refetch() : undefined}
        />
      ) : (
        <>
          <header className="visit-heading">
            <div>
              <h1>
                {data.visit.pager_no
                  ? t('visit.pager', { pager: data.visit.pager_no })
                  : t('visit.title', { ref: data.visit.visit_id.slice(0, 4) })}
              </h1>
              <p>
                {t(`complaint.${data.visit.complaint_group}`)} · {t('visit.ctas')} {data.visit.ctas}
              </p>
            </div>
            <span className="text-sm text-muted">{t(`visitStatus.${data.visit.status}`)}</span>
          </header>

          <div className="space-y-6">
            {isError && (
              <p role="status" className="rounded-data border border-line bg-surface p-3">
                {t('visit.stale')}
              </p>
            )}
            {task ? (
              <Concern
                task={task}
                entries={data.timeline}
                canAct={!!role && task.routed_to.includes(role)}
                stale={isError}
                onComplete={() => { focusCompletion.current = true }}
              />
            ) : (
              <section aria-live="polite" className="border-b border-line pb-4">
                <h2 ref={completedTitle} tabIndex={-1} className="text-lg font-semibold">
                  {data.timeline.some((entry) => 'event' in entry && entry.event === 'assessed')
                    ? t('visit.assessmentRecorded')
                    : t('visit.noTask')}
                </h2>
              </section>
            )}

            <dl className="flex flex-wrap gap-x-8 gap-y-3 border-b border-line pb-4">
              <div>
                <dt className="eyebrow">{t('visit.nextReassess')}</dt>
                <dd className="font-semibold"><CountdownChip due={data.visit.staff_reassess_due_at} now={now} /></dd>
              </div>
              <div>
                <dt className="eyebrow">{t('visit.nextPrompt')}</dt>
                <dd>
                  {data.visit.app_exclusion
                    ? t('time.notApplicable')
                    : <CountdownChip due={data.visit.next_prompt_due_at} now={now} />}
                </dd>
              </div>
            </dl>

            <VisitHistory entries={data.timeline} />
            {isNurse && <VisitActions key={id} detail={data} stale={isError} />}

            <details className="disclosure">
              <summary>{t('visit.details')}</summary>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label={t('visit.triaged')} value={stamp(data.visit.triaged_at)} />
                <Field label={t('visit.cedis')} value={data.visit.cedis_code ?? t('common.none')} />
                <Field label={t('visit.language')} value={t(`language.${data.visit.language}`)} />
                <Field label={t('visit.channel')} value={data.visit.channel ? t(`channel.${data.visit.channel}`) : t('common.none')} />
                <Field label={t('visit.app')} value={
                  data.visit.app_exclusion
                    ? t('enrol.notOffered', { reason: t(`exclusion.${data.visit.app_exclusion}`) })
                    : t('enrol.appOffered')
                } />
                {!data.visit.app_exclusion && <Field label={t('visit.device')} value={signedInText(data.visit, t)} />}
                <Field label={t('visit.lastStaffCheck')} value={data.visit.last_staff_check_at ? stamp(data.visit.last_staff_check_at) : t('common.none')} />
              </dl>
            </details>
          </div>
        </>
      )}
    </main>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-[1.0625rem]">{value}</dd>
    </div>
  )
}

function Concern({ task, entries, canAct, stale, onComplete }: {
  task: Task
  entries: TimelineEntry[]
  canAct: boolean
  stale: boolean
  onComplete: () => void
}) {
  const { t } = useTranslation()
  const reason = getPrimaryTaskReason(task)
  const source = entries.find(
    (entry): entry is Extract<TimelineEntry, { report_id: string }> =>
      'report_id' in entry && !!reason?.evidence.some((ref) => ref.kind === 'report' && ref.id === entry.report_id),
  )
  const steps = [
    { key: 'created', at: task.created_at, role: null },
    { key: 'delivered', at: task.delivered_at, role: null },
    { key: 'acknowledged', at: task.acknowledged_at, role: task.acknowledged_by?.role },
    { key: 'assessed', at: task.assessed_at, role: task.assessed_by?.role },
  ]
  const roles = task.routed_to.map((role) => t(`role.${role}`)).join(', ')

  return (
    <section className="concern-panel" aria-labelledby="active-concern">
      <span className={`task-label task-${task.level}`}>{t(`taskLevel.${task.level}`)}</span>
      <h2 id="active-concern">
        {reason
          ? t(`reason.${reason.reason_code}`, { defaultValue: reason.reason_code.replaceAll('_', ' ') })
          : t('actions.task')}
      </h2>
      <div className="mb-4 space-y-1 text-sm text-muted">
        {source ? (
          <p>{t('answers.from', { who: t(`reporter.${source.report.reporter}`), time: stamp(source.received_at) })}</p>
        ) : reason && (
          <p>{t('visit.flaggedAt', { time: stamp(reason.fired_at) })}</p>
        )}
        <p>
          {t('visit.routedTo', { roles })}
          {task.escalated && <> · {t('visit.routedToBackup')}</>}
        </p>
      </div>
      {canAct && <VisitTaskAction key={task.task_id} task={task} stale={stale} onComplete={onComplete} />}
      <details className="disclosure mt-4">
        <summary>{t('visit.reviewEvidence')}</summary>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {steps.map(({ key, at, role }) => (
            <Field key={key} label={t(`taskStep.${key}`)} value={
              [at ? stamp(at) : t('visit.pending'), role ? t(`role.${role}`) : null].filter(Boolean).join(' · ')
            } />
          ))}
        </dl>
        <ul className="mt-4 space-y-3">
          {task.reasons.map((entry, i) => (
            <li key={i}>
              <p>{t(`reason.${entry.reason_code}`, { defaultValue: entry.reason_code.replaceAll('_', ' ') })}</p>
              <p className="text-sm text-muted">
                {stamp(entry.fired_at)} · {t('visit.ruleLine', { rule: entry.rule_id, version: entry.rule_version, count: entry.evidence.length })}
              </p>
              {entry.evidence.map((e) => (
                <p className="break-all text-sm text-muted" key={`${e.kind}-${e.id}`}>{e.kind}: {e.id}</p>
              ))}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

function VisitHistory({ entries }: { entries: TimelineEntry[] }) {
  const { t } = useTranslation()
  const days = new Map<string, TimelineEntry[]>()
  for (const entry of entries) {
    const at = 'received_at' in entry ? entry.received_at : 'started_at' in entry ? entry.started_at : entry.at
    const day = new Date(at).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
    const list = days.get(day) ?? []
    list.push(entry)
    days.set(day, list)
  }
  const branchReports = entries.flatMap((entry) =>
    'report_id' in entry && entry.report.kind === 'checkin' && Object.keys(entry.report.items ?? {}).length > 0
      ? [{ report: entry.report, at: entry.received_at, id: entry.report_id }]
      : [],
  )

  return (
    <section aria-labelledby="visit-history">
      <h2 id="visit-history" className="section-title">{t('visit.timeline')}</h2>
      {days.size === 0 && <Timeline entries={[]} />}
      {[...days].map(([day, records]) => (
        <div className="mt-4" key={day}>
          <h3 className="mb-2 text-sm font-semibold text-muted">{day}</h3>
          <Timeline entries={records} />
        </div>
      ))}
      {branchReports.length > 0 && (
        <details className="disclosure mt-4">
          <summary>{t('visit.historyDetail')}</summary>
          <ul className="space-y-4">
            {branchReports.map(({ report, at, id }) => (
              <li key={id}><BranchAnswers report={report} at={at} /></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function BranchAnswers({ report, at }: { report: CheckinReport; at: string }) {
  const { t } = useTranslation()
  return (
    <>
      <p className="mb-2 text-sm text-muted">{t('answers.from', { who: t(`reporter.${report.reporter}`), time: stamp(at) })}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {Object.entries(report.items ?? {}).map(([key, value]) => (
          <Field
            key={key}
            label={bankItems.has(key) ? text(key, report.reporter) : key.replaceAll('_', ' ')}
            value={itemAnswerText(value, t)}
          />
        ))}
      </dl>
    </>
  )
}
