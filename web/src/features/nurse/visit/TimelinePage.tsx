import { ClipboardList, Flag, HeartPulse, Monitor, Smartphone, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { bankItems, text } from '@/api/bank'
import type { Task, TimelineEntry } from '@/api/types'
import { describeEntry } from '@/lib/timelineText'
import { attentionText, choiceText, findingsText, itemAnswerText, painText } from '@/lib/answers'
import { clock } from '@/lib/time'
import { cn } from '@/lib/utils'
import { AcknowledgeAction } from '../VisitActions'
import { Divider, Fact, Facts, PageHeading, SectionCard } from './parts'
import { LEVEL_TONE, entryTime, isCheckin, isReport, reasonText, reportSummary, type CheckinEntry, useVisit } from './model'

export function TimelinePage() {
  const { t } = useTranslation()
  const { detail, stale, canAcknowledge } = useVisit()
  const task = detail.open_task
  const entries = detail.timeline
  const latestCheckin = entries.filter(isCheckin).at(-1)

  return (
    <>
      <PageHeading
        title={t('visitTabs.timeline')}
        lead={t('visitPage.timeline.lead')}
        aside={t('visitPage.timeline.count', { count: entries.length })}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_27rem]">
        <section aria-label={t('visitTabs.timeline')} className="min-w-0 rounded-card bg-surface p-4 shadow-card sm:p-6">
          {entries.length === 0 ? (
            <p className="text-muted">{t('timeline.empty')}</p>
          ) : (
            <ol className="space-y-5">
              {entries.map((entry, i) => (
                <li key={i}>
                  <AuditEvent entry={entry} latest={entry === latestCheckin} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="min-w-0 space-y-5">
          {task ? (
            <>
              <WhyFlagged task={task} entries={entries} />
              <SectionCard title={t('visitPage.timeline.taskStatus')}>
                <TaskSteps task={task} />
                <Divider />
                <AcknowledgeAction task={task} canAct={canAcknowledge} stale={stale} />
              </SectionCard>
            </>
          ) : (
            <SectionCard title={t('visit.whyFlagged')}>
              <p className="text-muted">{t('visit.noTask')}</p>
            </SectionCard>
          )}
          <p className="text-[0.9375rem] text-muted">{t('visitPage.timeline.safeguard')}</p>
        </div>
      </div>
    </>
  )
}

/** Who an entry came from, shown under its time. */
function source(entry: TimelineEntry, t: ReturnType<typeof useTranslation>['t']): string | null {
  if (isReport(entry)) return t(`reporter.${entry.report.reporter}`)
  if ('vitals_id' in entry) return t(`role.${entry.entered_by.role}`)
  if ('flag_id' in entry) return t('reporter.staff')
  if ('session_id' in entry) return t(`reporter.${entry.role}`)
  return null
}

/** A small icon for the kind of entry. Reports get their own card instead. */
function EntryIcon({ entry }: { entry: TimelineEntry }) {
  const props = { 'aria-hidden': true, size: 20, className: 'shrink-0 text-brand-600' } as const
  if (isReport(entry)) return <TriangleAlert {...props} />
  if ('vitals_id' in entry) return <HeartPulse {...props} />
  if ('flag_id' in entry) return <Flag {...props} />
  if ('session_id' in entry) return <Smartphone {...props} />
  return entry.event === 'delivered' ? <Monitor {...props} /> : <ClipboardList {...props} />
}

function AuditEvent({ entry, latest }: { entry: TimelineEntry; latest: boolean }) {
  const { t } = useTranslation()
  const who = source(entry, t)
  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:gap-4', isCheckin(entry) ? 'sm:items-start' : 'sm:items-center')}>
      <div className="flex shrink-0 items-baseline gap-2 sm:block sm:w-24">
        <p className="tabular font-bold whitespace-nowrap">{clock(entryTime(entry))}</p>
        {who && <p className="text-[0.8125rem] text-muted uppercase sm:mt-1">{who}</p>}
      </div>
      {isCheckin(entry) ? (
        <ReportCard entry={entry} latest={latest} />
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-data bg-canvas p-4">
          <EntryIcon entry={entry} />
          <p className="min-w-0 font-semibold">{describeEntry(entry, t)}</p>
        </div>
      )}
    </div>
  )
}

/** A check-in, laid out like the overview so two reports can be compared down the page. */
function ReportCard({ entry, latest }: { entry: CheckinEntry; latest: boolean }) {
  const { t } = useTranslation()
  const c = entry.report
  return (
    <article className={cn('min-w-0 flex-1 space-y-4 rounded-data border border-line p-5', latest ? 'bg-canvas' : 'bg-surface')}>
      <header className="flex flex-wrap items-center justify-between gap-x-4">
        <h3 className="font-bold">{t('visitPage.timeline.report', { who: t(`reporter.${c.reporter}`) })}</h3>
        <p className="text-sm text-muted">{latest ? t('visitPage.timeline.latest') : t('visitPage.timeline.previous')}</p>
      </header>
      <Facts>
        <Fact label={t('answers.feelingChange')} value={choiceText(c.feeling_change, 'feeling_change', t)} />
        <Fact label={t('answers.feelingNow')} value={choiceText(c.feeling_now, 'feeling_now', t)} />
        <Fact label={t('answers.pain')} value={painText(c.pain, t)} />
      </Facts>
      <Divider />
      <Facts>
        <Fact label={t('answers.findings')} value={findingsText(c.new_findings, t)} />
        {Object.entries(c.items ?? {}).map(([key, value]) => (
          <Fact
            key={key}
            label={bankItems.has(key) ? text(key, c.reporter) : key.replaceAll('_', ' ')}
            value={itemAnswerText(value, t)}
          />
        ))}
        <Fact label={t('answers.attention')} value={attentionText(c.attention, t)} />
      </Facts>
    </article>
  )
}

/** Each reason on the task, its rule and version, and the reports it rests on. */
function WhyFlagged({ task, entries }: { task: Task; entries: TimelineEntry[] }) {
  const { t } = useTranslation()
  const evidence = task.reasons.reduce((n, r) => n + r.evidence.length, 0)
  return (
    <SectionCard title={t('visit.whyFlagged')} lead={t('visitPage.timeline.provenance', { count: evidence })}>
      {task.reasons.map((reason, i) => {
        const reports = entries.filter(
          (e): e is Extract<TimelineEntry, { report_id: string }> =>
            isReport(e) && reason.evidence.some((ref) => ref.kind === 'report' && ref.id === e.report_id),
        )
        return (
          <div key={i} className="space-y-3">
            {i > 0 && <Divider />}
            {reports.map((r) => (
              <div key={r.report_id} className={cn('space-y-1 rounded-data p-3.5', LEVEL_TONE[reason.level])}>
                <p className="text-sm font-bold uppercase">
                  {t(`reporter.${r.report.reporter}`)} · {clock(r.received_at)}
                </p>
                <p className="font-semibold">{reportSummary(r.report, t)}</p>
              </div>
            ))}
            <dl className="space-y-2">
              <Fact label={t('visitPage.timeline.reason')} value={reasonText(reason.reason_code, t)} />
              <Fact label={t('visitPage.timeline.rule')} value={<span className="break-all">{reason.rule_id}</span>} />
              <Fact label={t('visitPage.timeline.version')} value={reason.rule_version} />
            </dl>
          </div>
        )
      })}
    </SectionCard>
  )
}

function TaskSteps({ task }: { task: Task }) {
  const { t } = useTranslation()
  const steps = [
    { key: 'created', at: task.created_at, role: null },
    { key: 'delivered', at: task.delivered_at, role: null },
    { key: 'acknowledged', at: task.acknowledged_at, role: task.acknowledged_by?.role },
    { key: 'assessed', at: task.assessed_at, role: task.assessed_by?.role },
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
      {steps.map(({ key, at, role }) => (
        <Fact
          key={key}
          label={t(`taskStep.${key}`)}
          value={[at ? clock(at) : t('visitPage.pending'), role ? t(`role.${role}`) : null].filter(Boolean).join(' · ')}
        />
      ))}
    </dl>
  )
}
