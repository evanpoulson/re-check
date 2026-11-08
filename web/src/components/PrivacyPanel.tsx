import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** "What we store". Keyboard accessible disclosure, no dialog trap. Short and layered. */
export function PrivacyPanel() {
  const { t } = useTranslation()
  return (
    <details className="rounded-card bg-surface px-5 py-3 shadow-card">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-base font-medium text-brand-600">
        <ShieldCheck aria-hidden className="size-5" />
        {t('privacy.title')}
      </summary>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-base text-muted">
        <li>{t('privacy.seen')}</li>
        <li>{t('privacy.stored1')}</li>
        <li>{t('privacy.stored2')}</li>
        <li>{t('privacy.stored3')}</li>
        <li>{t('privacy.notStored')}</li>
        <li>{t('privacy.shared')}</li>
        <li>{t('privacy.code')}</li>
        <li>{t('privacy.synthetic')}</li>
      </ul>
    </details>
  )
}
