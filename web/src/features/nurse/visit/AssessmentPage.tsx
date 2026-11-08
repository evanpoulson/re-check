import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clock } from '@/lib/time'
import { cn } from '@/lib/utils'
import { AcknowledgeAction, DispositionForm, FlagHigherCard, VitalsCard } from '../VisitActions'
import { Note, PageHeading, SectionCard } from './parts'
import { lastAssessed, rolesText, useVisit } from './model'

/**
 * Reads in the order of the work: acknowledge, then the outcome, then vitals as supporting
 * input, then Flag higher. The grid has one column per group that this role actually sees.
 */
export function AssessmentPage() {
  const { t } = useTranslation()
  const { detail, stale, canAct, canAcknowledge, isDesk, canFlag, completed, onComplete } = useVisit()
  const task = detail.open_task
  // Acknowledging here moves focus straight to the outcomes, but only for a role that can choose one.
  const [focusRequest, setFocusRequest] = useState(0)
  const columns = 1 + (isDesk ? 1 : 0) + (canFlag ? 1 : 0)
  const assessed = lastAssessed(detail)
  const done = completed && assessed && completed.task_id === assessed.task_id ? completed : null

  return (
    <>
      <PageHeading title={t('visitTabs.assessment')} lead={t('visitPage.assessment.lead')} />
      <div
        className={cn(
          'grid items-start gap-6',
          // A role with only the review steps sees them side by side: acknowledge, then the outcome.
          columns === 1 && (task ? 'lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:max-w-5xl' : 'max-w-3xl'),
          columns >= 2 && 'lg:grid-cols-2',
          columns === 3 && 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_21.5rem]',
        )}
      >
        <div className={columns === 1 ? 'contents' : 'min-w-0 space-y-5'}>
          {task && (
            <SectionCard title={t('visitPage.assessment.firstAck')}>
              <AcknowledgeAction
                task={task}
                canAct={canAcknowledge}
                stale={stale}
                onAcknowledged={canAct ? () => setFocusRequest((n) => n + 1) : undefined}
              />
            </SectionCard>
          )}
          {task && canAct ? (
            <DispositionForm
              key={task.task_id}
              task={task}
              stale={stale}
              focusRequest={focusRequest}
              onComplete={onComplete}
            />
          ) : (
            <SectionCard title={t('visitPage.assessment.disposition')}>
              <p className={task ? 'font-semibold' : 'text-muted'}>
                {task
                  ? t('visitPage.assessment.notYours', { roles: rolesText(task.routed_to, t, 'disjunction') })
                  : assessed
                    ? t('visitPage.assessment.lastAssessed', {
                        outcome: done?.disposition ? t(`disposition.${done.disposition}`) : t('visit.assessmentRecorded'),
                        time: clock(assessed.at),
                      })
                    : t('actions.noTask')}
              </p>
            </SectionCard>
          )}
        </div>

        {isDesk && (
          <div className="min-w-0 space-y-4">
            <VitalsCard key={detail.visit.visit_id} detail={detail} stale={stale} />
            <Note tone="neutral">
              <p className="font-semibold">{t('visitPage.assessment.recordReminder')}</p>
              <p className="text-muted">{t('visitPage.assessment.recordReminderLead')}</p>
            </Note>
          </div>
        )}

        {canFlag && (
          <div className="min-w-0">
            <FlagHigherCard visit={detail.visit} stale={stale} />
          </div>
        )}
      </div>
    </>
  )
}
