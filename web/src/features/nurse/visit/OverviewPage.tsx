import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { bankItems, text } from '@/api/bank'
import { attentionText, choiceText, findingsText, itemAnswerText, painText } from '@/lib/answers'
import { clock } from '@/lib/time'
import { cn } from '@/lib/utils'
import { AcknowledgeAction, FlagHigherCard } from '../VisitActions'
import { Divider, Fact, Facts, Note, PageHeading, SectionCard } from './parts'
import { isCheckin, type CheckinEntry, useVisit } from './model'

const LINK_BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-tap border border-brand-500 bg-surface px-5 font-medium text-brand-600 transition-colors hover:bg-brand-50'

export function OverviewPage() {
  const { t } = useTranslation()
  const { detail, stale, canAcknowledge, canFlag } = useVisit()
  const task = detail.open_task
  const checkins = detail.timeline.filter(isCheckin)
  const latest = checkins.at(-1)
  const previous = checkins.at(-2)

  return (
    <>
      <PageHeading title={t('visitTabs.overview')} lead={t('visitPage.overview.lead')} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_27rem]">
        <div className="min-w-0 space-y-5">
          <WhatChanged latest={latest} previous={previous} flagged={!!task} />
          {latest && <LatestAnswers entry={latest} />}
          <Note>
            <p>{t('visitPage.overview.clockSafeguard')}</p>
          </Note>
        </div>

        <div className="min-w-0 space-y-5">
          {task && (
            <SectionCard title={t('visitPage.overview.review')}>
              <AcknowledgeAction task={task} canAct={canAcknowledge} stale={stale} />
              <Divider />
              <p className="text-[0.9375rem] text-muted">{t('visitPage.overview.nextStep')}</p>
              <Link to="assessment" className={cn(LINK_BUTTON, 'w-full')}>
                <ArrowRight aria-hidden size={18} />
                {t('visitPage.overview.goAssessment')}
              </Link>
            </SectionCard>
          )}
          {canFlag && <FlagHigherCard visit={detail.visit} stale={stale} />}
        </div>
      </div>
    </>
  )
}

/** The latest check-in against the one before it. Says what changed; never what it means. */
function WhatChanged({ latest, previous, flagged }: { latest?: CheckinEntry; previous?: CheckinEntry; flagged: boolean }) {
  const { t } = useTranslation()
  if (!latest) {
    return (
      <SectionCard title={t('visitPage.overview.changed')}>
        <p className="text-muted">{t('visitPage.overview.noCheckin')}</p>
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
      title={t('visitPage.overview.changed')}
      lead={t('visitPage.overview.reportFrom', { who: t(`reporter.${now.reporter}`), time: clock(latest.received_at) })}
    >
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className={cn('shrink-0 space-y-1 rounded-data p-4 sm:w-48', painRose ? 'bg-level-red-bg text-level-red' : 'bg-canvas')}>
          <p className="text-sm font-semibold uppercase">{t('visitPage.overview.painReported')}</p>
          <p className="tabular text-[2rem] leading-tight font-bold">
            {painBefore !== null && painNow !== null ? `${painBefore} → ${painNow}` : painText(now.pain, t)}
          </p>
          <p className="tabular text-sm">
            {previous ? `${clock(previous.received_at)} → ${clock(latest.received_at)}` : clock(latest.received_at)}
          </p>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-[1.3125rem] leading-snug font-semibold">
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
          {flagged && <p className="text-[0.9375rem] font-semibold">{t('visitPage.overview.queueUnchanged')}</p>}
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
      {c.reporter === 'companion' && <p className="text-[0.9375rem] font-semibold">{t('answers.companionOnly')}</p>}
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
      <Link to="timeline" className={LINK_BUTTON}>
        <ArrowRight aria-hidden size={18} />
        {t('visitPage.overview.compare')}
      </Link>
    </SectionCard>
  )
}
