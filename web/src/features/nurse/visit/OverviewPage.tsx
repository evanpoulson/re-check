import { ArrowRight, ArrowUp, Clock } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { bankItems, text } from '@/api/bank'
import { attentionText, choiceText, findingsText, itemAnswerText, painText } from '@/lib/answers'
import { clock, formatMinutes, isOverdue, untilMs } from '@/lib/time'
import { cn } from '@/lib/utils'
import { AcknowledgeAction, FlagHigherCard } from '../VisitActions'
import { Divider, Fact, Facts, PageHeading, Safeguard, SectionCard } from './parts'
import { isCheckin, lastReport, rolesText, type CheckinEntry, useVisit } from './model'

const LINK_BUTTON = 'inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-tap border border-brand-500 bg-surface px-5 text-center font-medium [overflow-wrap:anywhere] text-brand-600 transition-colors hover:bg-brand-50'

export function OverviewPage() {
  const { t } = useTranslation()
  const { detail, stale, canAcknowledge, canAct, canFlag, isDesk, now } = useVisit()
  const task = detail.open_task
  const { visit } = detail
  const checkins = detail.timeline.filter(isCheckin)
  const latest = checkins.at(-1)
  const previous = checkins.at(-2)
  const excluded = !!visit.app_exclusion
  // A missed check-in leads with the silence, not the last (old) answers.
  const silent = task?.reasons.some((r) => r.reason_code === 'missed_checkin') ?? false
  const since = lastReport(detail)?.received_at ?? visit.triaged_at
  const promptMs = untilMs(visit.next_prompt_due_at, now)

  const roles = task ? rolesText(task.routed_to, t, 'disjunction') : ''
  // What this role does next. A role that can't assess is told who does.
  const nextStep = !task ? null
    : canAct ? t(isDesk ? 'visitPage.overview.nextVitalsAssess' : 'visitPage.overview.nextAssess')
    : isDesk ? t('visitPage.overview.nextVitals', { roles })
    : t('visitPage.overview.nextNone', { roles })
  const lead = excluded ? t('visitPage.overview.leadExcluded')
    : task ? t('visitPage.overview.lead')
    : t('visitPage.overview.leadNoTask')
  const aside = !!task || canFlag

  return (
    <>
      <PageHeading title={t('visitTabs.overview')} lead={lead} />
      <div className={cn('grid items-start gap-6', aside && 'lg:grid-cols-[minmax(0,1fr)_27rem]')}>
        <div className="min-w-0 space-y-5">
          {silent && (
            <SectionCard title={t('visitPage.overview.changed')}>
              <div className="flex items-start gap-3">
                <Clock aria-hidden className="mt-1 size-5 shrink-0 text-level-silent" />
                <div className="space-y-1">
                  <p className="text-title font-semibold">
                    {t('visitPage.overview.silentSince', { time: clock(since) })}
                    {isOverdue(promptMs) && promptMs !== null && (
                      <span className="font-normal text-muted"> {t('visitPage.overview.silentOverdue', { value: formatMinutes(promptMs) })}</span>
                    )}
                  </p>
                  <p className="text-small font-semibold">{t('visitPage.overview.queueUnchanged')}</p>
                </div>
              </div>
            </SectionCard>
          )}
          <WhatChanged latest={latest} previous={previous} flagged={!!task && !silent} lastKnown={silent} excluded={excluded} />
          {latest && <LatestAnswers entry={latest} />}
          {!excluded && <Safeguard />}
        </div>

        {aside && (
          <div className="min-w-0 space-y-5">
            {task && (
              <SectionCard title={t('visitPage.overview.review')}>
                <AcknowledgeAction task={task} canAct={canAcknowledge} stale={stale} />
                {nextStep && (
                  <>
                    <Divider />
                    <p className="text-small text-muted">{nextStep}</p>
                    {(canAct || isDesk) && (
                      <Link to="assessment" className={cn(LINK_BUTTON, 'w-full')}>
                        <ArrowRight aria-hidden className="size-[1.125rem] rtl:-scale-x-100" />
                        {t('visitPage.overview.goAssessment')}
                      </Link>
                    )}
                  </>
                )}
              </SectionCard>
            )}
            {canFlag && <FlagHigherCard visit={visit} stale={stale} />}
          </div>
        )}
      </div>
    </>
  )
}

/** The latest check-in against the one before it. Says what changed; never what it means. */
function WhatChanged({ latest, previous, flagged, lastKnown, excluded }: {
  latest?: CheckinEntry
  previous?: CheckinEntry
  flagged: boolean
  /** The patient has gone quiet: this is the last known report, not the reason for review. */
  lastKnown: boolean
  excluded: boolean
}) {
  const { t } = useTranslation()
  const title = lastKnown ? t('visitPage.overview.lastKnown') : t('visitPage.overview.changed')
  if (!latest) {
    return (
      <SectionCard title={title}>
        <p className="text-muted">{excluded ? t('enrol.excludedHelp') : t('visitPage.overview.noCheckin')}</p>
      </SectionCard>
    )
  }
  const now = latest.report
  const before = previous?.report
  const painNow = now.pain.kind === 'answered' ? now.pain.value : null
  const painBefore = before?.pain.kind === 'answered' ? before.pain.value : null
  const painRose = painNow !== null && painBefore !== null && painNow > painBefore
  const findings = now.new_findings.kind === 'answered' && now.new_findings.value.length ? findingsText(now.new_findings, t) : null
  const change = choiceText(now.feeling_change, 'feeling_change', t)

  return (
    <SectionCard
      title={title}
      lead={t('visitPage.overview.reportFrom', { who: t(`reporter.${now.reporter}`), time: clock(latest.received_at) })}
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        {/* A rise is shown by the arrow and bold text; red is kept for the task level. */}
        <div className="shrink-0 space-y-1 rounded-data bg-canvas p-4 sm:w-48">
          <p className="text-small font-semibold">{t('visitPage.overview.painReported')}</p>
          <p className="tabular flex items-center gap-1.5 text-heading font-bold">
            {painBefore !== null && painNow !== null ? `${painBefore} → ${painNow}` : painText(now.pain, t)}
            {painRose && <ArrowUp aria-label={t('visitPage.overview.painRose')} className="size-6 shrink-0" strokeWidth={2.75} />}
          </p>
          <p className="tabular text-small">
            {previous ? `${clock(previous.received_at)} → ${clock(latest.received_at)}` : clock(latest.received_at)}
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-title font-semibold">
            {findings ? t('visitPage.overview.changeWith', { change, findings }) : change}
          </p>
          <dl className="space-y-1 text-muted">
            {before && (
              <div className="flex flex-wrap gap-x-2">
                <dt>{t('visitPage.overview.before')}</dt>
                <dd>{choiceText(before.feeling_change, 'feeling_change', t)} · {choiceText(before.feeling_now, 'feeling_now', t)}</dd>
              </div>
            )}
            <div className="flex flex-wrap gap-x-2">
              <dt>{t('visitPage.overview.now')}</dt>
              <dd className="text-ink">{change} · {choiceText(now.feeling_now, 'feeling_now', t)}</dd>
            </div>
          </dl>
          {flagged && <p className="text-small font-semibold">{t('visitPage.overview.queueUnchanged')}</p>}
        </div>
      </div>
    </SectionCard>
  )
}

/** Every answer from the latest check-in. Missing answers keep their reason; "Not sure" is never "no". */
function LatestAnswers({ entry }: { entry: CheckinEntry }) {
  const { t } = useTranslation()
  const c = entry.report
  return (
    <SectionCard
      title={t('visitPage.overview.latestAnswers')}
      lead={t('visitPage.overview.answersFrom', { who: t(`reporter.${c.reporter}`), time: clock(entry.received_at) })}
    >
      {c.reporter === 'companion' && <p className="text-small font-semibold">{t('answers.companionOnly')}</p>}
      <Facts>
        <Fact label={t('answers.feelingChange')} value={choiceText(c.feeling_change, 'feeling_change', t)} />
        <Fact label={t('answers.feelingNow')} value={choiceText(c.feeling_now, 'feeling_now', t)} />
        <Fact label={t('answers.pain')} value={painText(c.pain, t)} />
      </Facts>
      <Divider />
      <Facts rows>
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
      <Link to="timeline" className={LINK_BUTTON}>
        <ArrowRight aria-hidden className="size-[1.125rem] rtl:-scale-x-100" />
        {t('visitPage.overview.compare')}
      </Link>
    </SectionCard>
  )
}
