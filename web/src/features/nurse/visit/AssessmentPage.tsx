import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AcknowledgeAction, DispositionForm, FlagHigherCard, VitalsCard } from '../VisitActions'
import { Note, PageHeading, SectionCard } from './parts'
import { useVisit } from './model'

export function AssessmentPage() {
  const { t } = useTranslation()
  const { detail, stale, canAct, canAcknowledge, isDesk, canFlag, onComplete } = useVisit()
  const task = detail.open_task
  // Acknowledging here moves focus straight to the outcomes, the next step.
  const [focusRequest, setFocusRequest] = useState(0)

  return (
    <>
      <PageHeading title={t('visitTabs.assessment')} lead={t('visitPage.assessment.lead')} />
      <div className="grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-[30rem_minmax(0,1fr)_21.5rem]">
        {isDesk && (
          <div className="min-w-0 space-y-4">
            <VitalsCard key={detail.visit.visit_id} detail={detail} stale={stale} />
            <Note>
              <p className="font-semibold">{t('visitPage.assessment.recordReminder')}</p>
              <p className="text-muted">{t('visitPage.assessment.recordReminderLead')}</p>
            </Note>
          </div>
        )}

        <div className="min-w-0">
          {task ? (
            <DispositionForm
              key={task.task_id}
              task={task}
              canAct={canAct}
              stale={stale}
              focusRequest={focusRequest}
              onComplete={onComplete}
            />
          ) : (
            <SectionCard title={t('visitPage.assessment.disposition')}>
              <p className="text-muted">{t('actions.noTask')}</p>
            </SectionCard>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {task && (
            <SectionCard title={t('visitPage.assessment.firstAck')}>
              <AcknowledgeAction
                task={task}
                canAct={canAcknowledge}
                stale={stale}
                onAcknowledged={() => setFocusRequest((n) => n + 1)}
              />
            </SectionCard>
          )}
          {canFlag && <FlagHigherCard visit={detail.visit} stale={stale} />}
        </div>
      </div>
    </>
  )
}
