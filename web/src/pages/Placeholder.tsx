import { useTranslation } from 'react-i18next'

export function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{t(titleKey)}</h1>
    </main>
  )
}
