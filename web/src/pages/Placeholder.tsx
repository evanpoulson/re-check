import { useTranslation } from 'react-i18next'
import { usePageTitle } from '@/lib/page'

export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  usePageTitle(t(titleKey))
  return (
    <main id="main-content" className="mx-auto max-w-3xl p-6">
      <h1 className="text-title font-semibold">{t(titleKey)}</h1>
    </main>
  )
}
