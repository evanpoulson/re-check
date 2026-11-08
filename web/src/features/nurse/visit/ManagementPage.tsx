import { Navigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { clock } from '@/lib/time'
import { StopAppCard, VisitQrCard, VisitStatusCard } from '../VisitActions'
import { Divider, Fact, Facts, PageHeading, SectionCard } from './parts'
import { useVisit } from './model'

/** Routine actions first; the irreversible app exclusion sits alone at the bottom. */
export function ManagementPage() {
  const { t } = useTranslation()
  const { detail, stale, isDesk, canFlag } = useVisit()
  if (!isDesk) return <Navigate to=".." relative="path" replace />
  const { visit } = detail

  return (
    <>
      <PageHeading title={t('visitTabs.manage')} lead={t(canFlag ? 'visitPage.manage.leadTriage' : 'visitPage.manage.leadCharge')} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
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
            </Facts>
          </SectionCard>
          <VisitStatusCard visit={visit} stale={stale} />
        </div>
        <div className="min-w-0">
          <VisitQrCard visit={visit} stale={stale} />
        </div>
      </div>
      <section aria-labelledby="danger-zone" className="space-y-3 border-t border-line pt-6">
        <h3 id="danger-zone" className="text-lead font-semibold">{t('visitPage.manage.dangerZone')}</h3>
        <div className="max-w-2xl">
          <StopAppCard key={visit.app_exclusion ?? 'offered'} visit={visit} stale={stale} />
        </div>
      </section>
    </>
  )
}
