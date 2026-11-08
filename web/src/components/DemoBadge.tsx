import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function DemoBadge() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-muted">
      <FlaskConical aria-hidden className="size-3.5" />
      {t('demo.badge')}
    </span>
  )
}
