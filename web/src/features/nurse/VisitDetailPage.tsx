import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Circle } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getVisitDetail } from '@/api/api'
import type { CheckinReport, Task, VisitDetail } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { LevelChip } from '@/components/LevelChip'
import { Timeline } from '@/components/Timeline'
import { Card } from '@/components/ui/card'
import { attentionText, choiceText, findingsText, itemAnswerText, painText } from '@/lib/answers'
import { signedInText } from '@/lib/session'
import { clock, useNow } from '@/lib/time'
import { useDashboardEvents } from './useDashboardEvents'
import { VisitActions } from './VisitActions'

export function VisitDetailPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  useDashboardEvents()
  const now = useNow()
  const { data, isPending, isError } = useQuery({ queryKey: ['visit', id], queryFn: () => getVisitDetail(id) })

  if (isPending) return <main className="p-6">{t('common.loading')}</main>
  if (isError) return <main role="alert" className="p-6 font-semibold text-level-red">{t('visit.failed')}</main>

  const { visit, open_task: task } = data
  return (
    <main className="mx-auto grid max-w-[88rem] gap-6 p-4 lg:grid-cols-[1fr_26rem]">
      <div className="space-y-5">
        <Link to="/staff/triage" className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700">
          <ArrowLeft aria-hidden className="size-4" />
          {t('visit.back')}
        </Link>

        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">
              {visit.pager_no ? t('visit.pager', { pager: visit.pager_no }) : t('visit.title', { ref: visit.visit_id.slice(0, 4) })}
            </h1>
            {task && <LevelChip level={task.level} />}
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Field label={t('visit.ctas')} value={String(visit.ctas)} />
            <Field label={t('visit.complaint')} value={t(`complaint.${visit.complaint_group}`)} />
            <Field label={t('visit.cedis')} value={visit.cedis_code ?? t('common.none')} />
            <Field label={t('visit.language')} value={t(`language.${visit.language}`)} />
            <Field label={t('visit.channel')} value={visit.channel ? t(`channel.${visit.channel}`) : t('common.none')} />
            <Field label={t('visit.app')} value={visit.app_exclusion ? t('enrol.notOffered', { reason: t(`exclusion.${visit.app_exclusion}`) }) : t('enrol.appOffered')} />
            <Field label={t('visit.status')} value={t(`visitStatus.${visit.status}`)} />
            {!visit.app_exclusion && <Field label={t('visit.device')} value={signedInText(visit, t)} />}
            <Field label={t('visit.triaged')} value={clock(visit.triaged_at)} />
          </dl>
        </Card>

        <Card className="space-y-2">
          <h2 className="text-xl font-extrabold">{t('visit.timers')}</h2>
          <p className="text-sm text-muted">{t('visit.timersHelp')}</p>
          <dl className="grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-sm font-semibold text-muted">{t('visit.nextPrompt')}</dt>
              <dd>{visit.app_exclusion ? t('time.notApplicable') : <CountdownChip due={visit.next_prompt_due_at} now={now} />}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-muted">{t('visit.nextReassess')}</dt>
              <dd><CountdownChip due={visit.staff_reassess_due_at} now={now} /></dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-muted">{t('visit.lastStaffCheck')}</dt>
              <dd>{visit.last_staff_check_at ? clock(visit.last_staff_check_at) : t('common.none')}</dd>
            </div>
          </dl>
        </Card>

        {task ? <TaskCard task={task} /> : (
          <Card><p className="text-muted">{t('visit.noTask')}</p></Card>
        )}

        <LatestAnswers detail={data} />

        <Card className="space-y-3">
          <h2 className="text-xl font-extrabold">{t('visit.timeline')}</h2>
          <Timeline entries={data.timeline} />
        </Card>
      </div>

      <aside>
        <VisitActions detail={data} />
      </aside>
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
  const steps = [
    { key: 'created', at: task.created_at, by: null as string | null },
    { key: 'delivered', at: task.delivered_at, by: null },
    { key: 'acknowledged', at: task.acknowledged_at, by: task.acknowledged_by ? t(`role.${task.acknowledged_by.role}`) : null },
    { key: 'assessed', at: task.assessed_at, by: task.assessed_by ? t(`role.${task.assessed_by.role}`) : null },
  ]
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-extrabold">{t('visit.whyFlagged')}</h2>
      <ul className="space-y-2">
        {task.reasons.map((r, i) => (
          <li key={i} className="rounded-data bg-canvas p-3">
            <div className="flex items-center gap-2">
              <LevelChip level={r.level} />
              <span className="font-semibold">{t(`reason.${r.reason_code}`, { defaultValue: r.reason_code })}</span>
            </div>
            <div className="mt-1 text-sm text-muted">
              {t('visit.ruleLine', { rule: r.rule_id, version: r.rule_version, count: r.evidence.length })}
            </div>
          </li>
        ))}
      </ul>
      <ol className="grid gap-2 sm:grid-cols-2" aria-label={t('visit.steps')}>
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            {s.at ? <Check aria-hidden className="size-5 text-brand-700" /> : <Circle aria-hidden className="size-5 text-line" />}
            <span className="font-semibold">{t(`taskStep.${s.key}`)}</span>
            <span className="tabular text-muted">
              {s.at ? clock(s.at) : t('visit.pending')}
              {s.by ? `, ${s.by}` : ''}
              {s.key === 'assessed' && task.disposition ? `, ${t(`disposition.${task.disposition}`)}` : ''}
            </span>
          </li>
        ))}
      </ol>
    </Card>
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
    <Card className="space-y-2">
      <h2 className="text-xl font-extrabold">{t('visit.latestAnswers')}</h2>
      <p className="text-sm text-muted">{t('answers.from', { who: t(`reporter.${c.reporter}`), time: clock(last.received_at) })}</p>
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
