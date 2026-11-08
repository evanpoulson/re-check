import { Info } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Role } from '@/api/types'

const POINTS = ['sickestFirst', 'levels', 'checkins', 'worse', 'leaving'] as const

/**
 * "How triage works" for every patient and companion, plus the level set at
 * triage in plain words when the site shows it (research brief §4a). Never a
 * target time: real waits run far past them. Spacing uses logical properties
 * (ps-, gap) so Arabic and Urdu mirror correctly.
 */
export function TriageCard({ level, role }: { level: number | null | undefined; role: Role }) {
  const { t } = useTranslation()
  const headingId = useId()
  return (
    <section aria-labelledby={level ? headingId : undefined} className="space-y-3 rounded-card bg-surface px-5 py-4 shadow-card">
      {level ? (
        <div className="space-y-1">
          <h2 id={headingId} className="text-base font-medium text-muted">
            {t('triageInfo.level.heading', { context: role === 'companion' ? 'companion' : undefined })}
          </h2>
          <p className="text-title font-semibold">
            {t('triageInfo.level.label', { level, name: t(`triageInfo.level.${level}.name`) })}
          </p>
          <p className="text-base">{t(`triageInfo.level.${level}.body`)}</p>
          <p className="text-base text-muted">{t('triageInfo.level.setAtTriage')}</p>
        </div>
      ) : null}
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-base font-medium text-brand-600">
          <Info aria-hidden className="size-5 shrink-0" />
          {t('triageInfo.title')}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-6 text-base">
          {POINTS.map((p) => (
            <li key={p}>{t(`triageInfo.${p}`)}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}
