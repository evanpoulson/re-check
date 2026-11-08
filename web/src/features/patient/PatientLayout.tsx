import { CloudOff, Languages } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { translations } from '@/api/bank'
import type { ConcernCode, PatientHome } from '@/api/types'
import { Brand } from '@/components/Brand'
import { HelpBar } from '@/components/HelpBar'
import { TriageCard } from '@/components/TriageCard'
import { PrivacyPanel } from '@/components/PrivacyPanel'
import { chooseLanguage, LANGUAGES } from '@/i18n'
import { flushOutbox, pendingCount } from '@/lib/outbox'
import { clock, durationWords, isolate, waitWords } from '@/lib/time'

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
  dock?: { onConcern: (c: ConcernCode) => void; onLeaving: () => void; disabled?: boolean; helpOnly?: boolean }
  /**
   * Home and the role picker show the full waiting-room information: the wait,
   * "How triage works" and "What we store". Question and form screens show only
   * the one-line promise that staff decide the order of care.
   */
  about?: boolean
  children: ReactNode
}

/**
 * Every patient and companion screen: the language switch, who decides the order
 * of care, and the docked always-visible buttons. Home and the role picker add the
 * AHS wait estimate and time waited, "How triage works" and "What we store". AHS
 * defines its estimate as triage to first physician for less urgent patients, so
 * it is worded that way and never as this person's wait.
 */
export function PatientLayout({ home, dock, about = false, children }: Props) {
  const { t, i18n } = useTranslation()
  const estimate = home?.wait_estimate
  const lang = LANGUAGES.includes(i18n.language as never) ? i18n.language : 'en'
  // A language change re-renders the heading but not the step, so retitle here too.
  useEffect(() => {
    const heading = document.querySelector('.patient-shell main h1')
    if (heading?.textContent) document.title = `${heading.textContent} · Recheck`
  }, [i18n.language])
  return (
    <div className={`patient-shell ${dock ? 'has-dock' : ''}`}>
      <header className="glass sticky top-0 z-20 border-b border-line/70">
        <div className="patient-header mx-auto max-w-md px-4 py-1">
        <Brand />
        <label className="flex items-center gap-1.5 text-small">
          <Languages aria-hidden className="size-5 shrink-0 text-muted" />
          <span className="sr-only">{t('patient.language')}</span>
          <select
            className="min-h-11 rounded-tap border border-answer bg-surface px-3 font-medium text-brand-600"
            value={lang}
            onChange={(e) => void chooseLanguage(e.target.value)}
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
        <p role="note" className="rounded-card border border-line bg-surface px-5 py-3 text-base">
          {t(translations[lang] ? 'patient.languageNotice' : 'patient.languageMissing')}
        </p>
      )}

      <OutboxBanner />
      <main className="space-y-5">{children}</main>
      <section aria-label={t('patient.waitContext')} className="patient-context">
        <p>{t('patient.placeInLine')}</p>
        {about && home && (
          <dl className="patient-wait">
            <div>
              <dt>{t('patient.waitedLabel')}</dt>
              <dd dir="auto">{durationWords(home.waited_minutes, t)}</dd>
            </div>
            <div>
              <dt>{t('patient.estimateLabel')}</dt>
              <dd dir="auto">
                {estimate ? (
                  <>
                    {t('patient.estimateValue', { estimate: waitWords(estimate.minutes, t) })}{' '}
                    <span className="patient-wait-note">{t('patient.estimateNote', { time: isolate(clock(estimate.as_of, lang)) })}</span>
                  </>
                ) : (
                  t('patient.waitUnavailable')
                )}
              </dd>
            </div>
          </dl>
        )}
      </section>
      {about && home && <TriageCard level={home.triage_level} role={home.role} />}
      {about && <PrivacyPanel />}
      </div>
      {dock && home ? <HelpBar role={home.role} {...dock} /> : null}
    </div>
  )
}
