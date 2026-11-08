import { CloudOff } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConcernCode, PatientHome } from '@/api/types'
import { HelpBar } from '@/components/HelpBar'
import { PrivacyPanel } from '@/components/PrivacyPanel'
import { LANGUAGES } from '@/i18n'
import { flushOutbox, pendingCount } from '@/lib/outbox'

/** "Saved, will send when connected". Retries on reconnect and on a timer. */
function OutboxBanner() {
  const { t } = useTranslation()
  const [count, setCount] = useState(pendingCount)
  useEffect(() => {
    const tryFlush = () => {
      void flushOutbox().finally(() => setCount(pendingCount()))
    }
    const id = setInterval(() => {
      setCount(pendingCount())
      if (pendingCount() > 0) tryFlush()
    }, 4000)
    window.addEventListener('online', tryFlush)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', tryFlush)
    }
  }, [])
  if (count === 0) return null
  return (
    <p role="status" className="flex items-center gap-2 rounded-xl bg-level-amber-bg p-3 font-semibold text-level-amber">
      <CloudOff aria-hidden className="size-5 shrink-0" />
      {t('outbox.saved', { count })}
    </p>
  )
}

/**
 * Every patient and companion screen: wait range, the place-in-line promise,
 * the language switch, "What we store", and the pinned help bar.
 */
export function PatientLayout({
  home,
  onConcern,
  children,
}: {
  home?: PatientHome
  onConcern?: (c: ConcernCode) => void
  children: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const wait = home?.wait_range
  return (
    <div className="mx-auto min-h-dvh max-w-md space-y-4 px-4 pb-32 pt-4 text-lg">
      <header className="flex items-center justify-between gap-3">
        <span className="text-xl font-bold text-brand-700">{t('app.name')}</span>
        <label className="flex items-center gap-2 text-base">
          <span className="sr-only">{t('patient.language')}</span>
          <select
            className="min-h-11 rounded-lg border border-line bg-surface px-2"
            value={LANGUAGES.includes(i18n.language as never) ? i18n.language : 'en'}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{t(`language.${l}`)}</option>
            ))}
          </select>
        </label>
      </header>

      {wait && (
        <p className="rounded-xl bg-brand-50 p-3 text-base">
          {t('patient.wait', { low: wait.low_minutes, high: wait.high_minutes })}
        </p>
      )}
      <p className="text-base font-semibold text-muted">{t('patient.placeInLine')}</p>
      <OutboxBanner />
      <main className="space-y-4">{children}</main>
      <PrivacyPanel />
      {onConcern ? <HelpBar onConcern={onConcern} /> : null}
    </div>
  )
}
