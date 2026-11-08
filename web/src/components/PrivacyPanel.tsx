import { ChevronDown, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const POINTS = ['seen', 'stored1', 'stored2', 'stored3', 'notStored', 'shared', 'code', 'synthetic'] as const

/** "What we store". Keyboard accessible disclosure, no dialog trap. Short and layered. */
export function PrivacyPanel() {
  const { t } = useTranslation()
  return (
    <details className="p-disclosure">
      <summary>
        <ShieldCheck aria-hidden className="size-5 shrink-0" />
        {t('privacy.title')}
        <ChevronDown aria-hidden className="chev size-5" />
      </summary>
      <ul>
        {POINTS.map((p) => (
          <li key={p}>{t(`privacy.${p}`)}</li>
        ))}
      </ul>
    </details>
  )
}
