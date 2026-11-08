import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** "Synthetic data, demo thresholds". Shown in every staff screen's chrome. */
export function DemoBadge() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-level-overdue-bg px-2.5 py-0.5 text-xs font-semibold text-level-overdue">
      <FlaskConical aria-hidden className="size-3.5" />
      {t('demo.badge')}
    </span>
  )
}
