import { CloudOff, Languages } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { translations } from '@/api/bank'
import type { ConcernCode, PatientHome } from '@/api/types'
import { Brand } from '@/components/Brand'
import { HelpBar } from '@/components/HelpBar'
import { PrivacyPanel } from '@/components/PrivacyPanel'
import { LANGUAGES } from '@/i18n'
import { flushOutbox, pendingCount } from '@/lib/outbox'
import { clock, durationWords, waitWords } from '@/lib/time'

/** Says plainly that saved reports have not reached staff yet. Retries on reconnect and on a timer. */
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
    <p role="status" className="flex items-center gap-2 rounded-card bg-level-amber-bg px-5 py-3 font-semibold text-level-amber">
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
 * Every patient and companion screen: the language switch, who decides the order
 * of care, the AHS wait estimate and time waited, "What we store", and the docked
 * always-visible buttons. AHS defines its estimate as triage to first physician
 * for less urgent patients, so it is worded that way and never as this person's wait.
 */
export function PatientLayout({ home, dock, children }: Props) {
  const { t, i18n } = useTranslation()
  const estimate = home?.wait_estimate
  const lang = LANGUAGES.includes(i18n.language as never) ? i18n.language : 'en'
  return (
    <div className={`patient-shell ${dock ? 'has-dock' : ''}`}>
      <header className="glass sticky top-0 z-20 border-b border-line/70">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-1">
        <Brand />
        <label className="flex items-center gap-1.5 text-[0.9375rem]">
          <Languages aria-hidden className="size-5 text-muted" />
          <span className="sr-only">{t('patient.language')}</span>
          <select
            className="min-h-11 rounded-tap bg-transparent px-2 font-medium text-brand-600"
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
        </div>
      </header>
      <div className="mx-auto max-w-md space-y-5 px-4 pt-6">

      {/* Unreviewed translations say so; a language with none says questions are in English. */}
      {lang !== 'en' && translations[lang]?.status !== 'reviewed' && (
        <p role="note" className="rounded-card bg-brand-50 px-5 py-3 text-base">
          {t(translations[lang] ? 'patient.languageNotice' : 'patient.languageMissing')}
        </p>
      )}

      <OutboxBanner />
      <main className="space-y-5">{children}</main>
      <section aria-label={t('patient.waitContext')} className="patient-context">
        <p>{t('patient.placeInLine')}</p>
        {home && (
          <>
            <p>
              {estimate
                ? `${t('patient.departmentWait', { estimate: waitWords(estimate.minutes, t) })} ${t('patient.updated', { time: clock(estimate.as_of) })}`
                : t('patient.waitUnavailable')}
            </p>
            <p>{t('patient.waited', { waited: durationWords(home.waited_minutes, t) })}</p>
          </>
        )}
      </section>
      <PrivacyPanel />
      </div>
      {dock && home ? <HelpBar role={home.role} {...dock} /> : null}
    </div>
  )
}
