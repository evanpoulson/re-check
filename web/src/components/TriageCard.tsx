import { ChevronDown, Info } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Role } from '@/api/types'

const POINTS = ['sickestFirst', 'levels', 'checkins', 'worse', 'leaving'] as const

/**
 * The level set at triage in plain words, when the site shows it (research
 * brief §4a). Never a target time: real waits run far past them.
 */
export function TriageLevel({ level, role }: { level: number | null | undefined; role: Role }) {
  const { t } = useTranslation()
  const headingId = useId()
  if (!level) return null
  return (
    <section aria-labelledby={headingId} className="p-card space-y-1">
      <h2 id={headingId} className="text-base font-medium text-muted">
        {t('triageInfo.level.heading', { context: role === 'companion' ? 'companion' : undefined })}
      </h2>
      <p className="text-title font-semibold">
        {t('triageInfo.level.label', { level, name: t(`triageInfo.level.${level}.name`) })}
      </p>
      <p className="text-base">{t(`triageInfo.level.${level}.body`)}</p>
      <p className="text-base text-muted">{t('triageInfo.level.setAtTriage')}</p>
    </section>
  )
}

/**
 * "How triage works", for every patient and companion. A row in the grouped
 * list at the foot of the page. Spacing uses logical properties so Arabic and
 * Urdu mirror correctly.
 */
export function TriageInfo() {
  const { t } = useTranslation()
  return (
    <details className="p-disclosure">
      <summary>
        <Info aria-hidden className="size-5 shrink-0" />
        {t('triageInfo.title')}
        <ChevronDown aria-hidden className="chev size-5" />
      </summary>
      <ul>
        {POINTS.map((p) => (
          <li key={p}>{t(`triageInfo.${p}`)}</li>
        ))}
      </ul>
    </details>
  )
}
