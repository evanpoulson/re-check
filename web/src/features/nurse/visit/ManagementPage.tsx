import { Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { signedInText } from '@/lib/session'
import { clock } from '@/lib/time'
import { StopAppCard, VisitQrCard, VisitStatusCard } from '../VisitActions'
import { Divider, Fact, Facts, PageHeading, SectionCard } from './parts'
import { useVisit } from './model'

export function ManagementPage() {
  const { t } = useTranslation()
  const { detail, stale, isNurse } = useVisit()
  if (!isNurse) return <Navigate to=".." relative="path" replace />
  const { visit } = detail

  return (
    <>
      <PageHeading title={t('visitTabs.manage')} lead={t('visitPage.manage.lead')} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_35.5rem]">
        <div className="min-w-0 space-y-5">
          <SectionCard title={t('visit.details')}>
            <Facts>
              <Fact label={t('visit.language')} value={t(`languageName.${visit.language}`)} />
              <Fact label={t('visit.channel')} value={visit.channel ? t(`channel.${visit.channel}`) : t('common.none')} />
              <Fact
                label={t('visit.app')}
                value={visit.app_exclusion ? t('enrol.notOffered', { reason: t(`exclusion.${visit.app_exclusion}`) }) : t('enrol.appOffered')}
              />
            </Facts>
            <Divider />
            <Facts>
              <Fact label={t('visit.triaged')} value={clock(visit.triaged_at)} />
              <Fact label={t('visit.lastStaffCheck')} value={visit.last_staff_check_at ? clock(visit.last_staff_check_at) : t('common.none')} />
              <Fact label={t('visit.status')} value={t(`visitStatus.${visit.status}`)} />
              {!visit.app_exclusion && <Fact label={t('visit.device')} value={signedInText(visit, t)} />}
            </Facts>
          </SectionCard>
          <VisitQrCard visit={visit} stale={stale} />
          <VisitStatusCard visit={visit} stale={stale} />
        </div>
        <div className="min-w-0">
          <StopAppCard key={visit.app_exclusion ?? 'offered'} visit={visit} stale={stale} />
        </div>
      </div>
    </>
  )
}
