import { CloudOff, Languages } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConcernCode, PatientHome } from '@/api/types'
import { Brand } from '@/components/Brand'
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
    <p role="status" className="flex items-center gap-2 rounded-data bg-level-amber-bg p-3 font-bold text-level-amber">
      <CloudOff aria-hidden className="size-5 shrink-0" />
      {t('outbox.saved', { count })}
    </p>
  )
}

interface Props {
  home?: PatientHome
  /** Present on screens that show the four always-visible buttons. */
  dock?: { onConcern: (c: ConcernCode) => void; onLeaving: () => void; disabled?: boolean }
  children: ReactNode
}

/**
 * Every patient and companion screen: the language switch, the place-in-line
 * promise, the wait range, "What we store", and the docked always-visible buttons.
 */
export function PatientLayout({ home, dock, children }: Props) {
  const { t, i18n } = useTranslation()
  const wait = home?.wait_range
  const lang = LANGUAGES.includes(i18n.language as never) ? i18n.language : 'en'
  return (
    <div className={`patient-shell ${dock ? 'has-dock' : ''}`}>
      <header className="patient-header">
        <Brand />
        <label className="flex items-center gap-2 text-base">
          <Languages aria-hidden className="size-5 text-muted" />
          <span className="sr-only">{t('patient.language')}</span>
          <select
            className="min-h-11 rounded-data border border-ink bg-surface px-2 font-semibold"
            value={lang}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {t(`language.${l}`)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* The question bank is English only until translations are supplied. */}
      {lang !== 'en' && (
        <p role="note" className="rounded-data border-l-8 border-brand-600 bg-brand-50 p-3 text-base">
          {t('patient.languageNotice')}
        </p>
      )}

      <section aria-label="While you wait" className="patient-context">
        {t('patient.placeInLine')}
        {wait && <span>{t('patient.wait', { low: wait.low_minutes, high: wait.high_minutes })}</span>}
      </section>
      <OutboxBanner />
      <main className="space-y-5">{children}</main>
      <PrivacyPanel />
      {dock && home ? <HelpBar role={home.role} {...dock} /> : null}
    </div>
  )
}
