import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function DemoBadge({ onLight = false }: { onLight?: boolean }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-1 rounded-data border px-2 py-0.5 text-xs font-bold ${onLight ? 'border-ink text-ink' : 'border-white/60 text-white'}`}>
      <FlaskConical aria-hidden className="size-3.5" />
      {t('demo.badge')}
    </span>
  )
}
