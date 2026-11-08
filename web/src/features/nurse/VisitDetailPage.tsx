import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Circle } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PageState } from '@/components/PageState'
import { Sparkline } from '@/components/Sparkline'
import { taskLabel } from '@/lib/taskLabels'
import { useStaff } from './staff'
import { getVisitDetail } from '@/api/api'
import type { CheckinReport, Task, VisitDetail } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { LevelChip } from '@/components/LevelChip'
import { Timeline } from '@/components/Timeline'
import { Card } from '@/components/ui/card'
import { attentionText, choiceText, findingsText, itemAnswerText, painText } from '@/lib/answers'
import { clock, useNow } from '@/lib/time'
import { useDashboardEvents } from './useDashboardEvents'
import { VisitActions } from './VisitActions'

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
  const back = role === 'triage_nurse' ? '/staff/triage' : '/staff/physician'
  if (isPending || isError)
    return (
      <main id="main-content" className="staff-page">
        <Link className="back-link" to={back}>
          <ArrowLeft size={16} aria-hidden />
          Back to worklist
        </Link>
        <PageState
          loading={isPending}
          title={isPending ? 'Loading visit' : 'Visit could not be loaded'}
          retry={isError ? () => void refetch() : undefined}
        />
      </main>
    )
  const { visit, open_task: task } = data
  const trend = data.timeline
    .filter((e) => 'report_id' in e && e.report.kind === 'checkin')
    .flatMap((e) => {
      if (!('report_id' in e) || e.report.kind !== 'checkin') return []
      const r = e.report
      return [
        {
          at: e.received_at,
          pain: r.pain.kind === 'answered' ? r.pain.value : null,
          feeling_now: r.feeling_now.kind === 'answered' ? r.feeling_now.value : null,
          feeling_change: r.feeling_change.kind === 'answered' ? r.feeling_change.value : null,
        },
      ]
    })
  return (
    <main id="main-content" className="staff-page">
      <Link to={back} className="back-link">
        <ArrowLeft aria-hidden size={16} />
        {role === 'triage_nurse' ? 'Back to triage board' : 'Back to review worklist'}
      </Link>
      <header className="visit-heading">
        <div>
          <h1>
            {visit.pager_no ? t('visit.pager', { pager: visit.pager_no }) : `Visit P-${visit.visit_id.slice(0, 4)}`}
          </h1>
          <p>
            {t(`complaint.${visit.complaint_group}`)} · Initial CTAS {visit.ctas} · Triaged {clock(visit.triaged_at)}
          </p>
        </div>
        <span className="text-sm text-muted">{t(`visitStatus.${visit.status}`)}</span>
      </header>
      <div className="visit-layout">
        {task ? (
          <TaskCard task={task} />
        ) : (
          <section className="concern-panel">
            <h2>
              {data.timeline.some((e) => 'event' in e && e.event === 'assessed')
                ? 'Assessment recorded'
                : 'No active review task'}
            </h2>
            <p className="text-muted">Staff reassessments continue independently of patient check-ins.</p>
          </section>
        )}
        <aside className="visit-actions">
          <VisitActions key={`${id}:${task?.task_id ?? 'none'}`} detail={data} />
        </aside>
        <div className="visit-main">
          <section>
            <h2 className="section-title">Two separate check-in schedules</h2>
            <dl className="timers">
              <div>
                <dt>Patient check-in</dt>
                <dd>
                  {visit.app_exclusion ? (
                    t('time.notApplicable')
                  ) : (
                    <CountdownChip due={visit.next_prompt_due_at} now={now} />
                  )}
                </dd>
              </div>
              <div>
                <dt>Staff reassessment</dt>
                <dd>
                  <CountdownChip due={visit.staff_reassess_due_at} now={now} />
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted">Patient answers do not reset the staff reassessment timer.</p>
          </section>
          {trend.length > 0 && (
            <section className="border-t border-line pt-5">
              <h2 className="section-title">Patient-reported pain</h2>
              <div className="flex flex-wrap items-center gap-6">
                <Sparkline trend={trend} width={180} height={48} />
                <ol className="flex flex-wrap gap-6">
                  {trend.map((point, i) => (
                    <li key={i}>
                      <strong className="text-xl font-semibold">
                        {point.pain === null ? 'No answer' : `${point.pain}/10`}
                      </strong>
                      <p className="text-sm text-muted">{clock(point.at)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}
          <LatestAnswers detail={data} />
          <section className="border-t border-line pt-5">
            <h2 className="section-title">{t('visit.timeline')}</h2>
            <Timeline entries={data.timeline} />
          </section>
          <details className="disclosure">
            <summary>Visit details</summary>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label={t('visit.ctas')} value={String(visit.ctas)} />
              <Field label={t('visit.complaint')} value={t(`complaint.${visit.complaint_group}`)} />
              <Field label={t('visit.cedis')} value={visit.cedis_code ?? t('common.none')} />
              <Field label={t('visit.language')} value={t(`language.${visit.language}`)} />
              <Field
                label={t('visit.channel')}
                value={visit.channel ? t(`channel.${visit.channel}`) : t('common.none')}
              />
              <Field
                label={t('visit.app')}
                value={
                  visit.app_exclusion
                    ? t('enrol.notOffered', { reason: t(`exclusion.${visit.app_exclusion}`) })
                    : t('enrol.appOffered')
                }
              />
              <Field
                label={t('visit.lastStaffCheck')}
                value={visit.last_staff_check_at ? clock(visit.last_staff_check_at) : t('common.none')}
              />
            </dl>
          </details>
        </div>
      </div>
    </main>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** Why it was flagged, and where the task is: created, delivered, acknowledged, assessed. */
function TaskCard({ task }: { task: Task }) {
  const { t } = useTranslation()
  const reason = task.reasons.find((r) => r.level === task.level) ?? task.reasons[0]
  const steps = [
    { key: 'created', at: task.created_at, by: null },
    { key: 'delivered', at: task.delivered_at, by: null },
    { key: 'acknowledged', at: task.acknowledged_at, by: task.acknowledged_by?.role },
    { key: 'assessed', at: task.assessed_at, by: task.assessed_by?.role },
  ]
  return (
    <section className="concern-panel">
      <span className={`task-label task-${task.level}`}>{taskLabel[task.level]}</span>
      <h2>{t(`reason.${reason.reason_code}`, { defaultValue: reason.reason_code.replaceAll('_', ' ') })}</h2>
      <p className="routing">
        Routed to {task.routed_to.map((role) => t(`role.${role}`)).join(', ')}
        {task.escalated ? ' · Backup notified' : ''}
      </p>
      <ol className="task-progress" aria-label={t('visit.steps')}>
        {steps.map((step) => (
          <li key={step.key}>
            <span>
              {step.at ? <Check size={15} aria-hidden /> : <Circle size={15} aria-hidden className="text-muted" />}
              {t(`taskStep.${step.key}`)}
            </span>
            <p>{step.at ? clock(step.at) : t('visit.pending')}</p>
            {step.by && <p>{t(`role.${step.by}`)}</p>}
          </li>
        ))}
      </ol>
      <details className="disclosure mt-5">
        <summary>Review reasons &amp; evidence ({task.reasons.length})</summary>
        <ul className="space-y-4">
          {task.reasons.map((r, i) => (
            <li key={i}>
              <div className="flex flex-wrap items-center gap-2">
                <LevelChip level={r.level} />
                <span>{t(`reason.${r.reason_code}`, { defaultValue: r.reason_code.replaceAll('_', ' ') })}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {clock(r.fired_at)} · Rule {r.rule_id} · v{r.rule_version}
              </p>
              {r.evidence.map((e) => (
                <p className="mt-1 break-all text-sm text-muted" key={`${e.kind}-${e.id}`}>
                  {e.kind}: {e.id}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

const humanKey = (k: string) => k.replace(/_/g, ' ')

/** The latest check-in, with every missing reason kept distinct from "no". */
function LatestAnswers({ detail }: { detail: VisitDetail }) {
  const { t } = useTranslation()
  const last = [...detail.timeline]
    .reverse()
    .find((e): e is Extract<typeof e, { report_id: string }> => 'report_id' in e && e.report.kind === 'checkin')
  if (!last) return null
  const c = last.report as CheckinReport
  const rows: [string, string][] = [
    [t('answers.feelingChange'), choiceText(c.feeling_change, 'feeling_change', t)],
    [t('answers.feelingNow'), choiceText(c.feeling_now, 'feeling_now', t)],
    [t('answers.pain'), painText(c.pain, t)],
    [t('answers.findings'), findingsText(c.new_findings, t)],
    [t('answers.attention'), attentionText(c.attention, t)],
    ...Object.entries(c.items ?? {}).map(([k, a]): [string, string] => [humanKey(k), itemAnswerText(a, t)]),
  ]
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">{t('visit.latestAnswers')}</h2>
      <p className="text-sm text-muted">
        {t('answers.from', { who: t(`reporter.${c.reporter}`), time: clock(last.received_at) })}
      </p>
      {c.reporter === 'companion' && <p className="text-sm font-semibold">{t('answers.companionOnly')}</p>}
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm font-semibold capitalize text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
