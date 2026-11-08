import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Lock, Printer, UserRoundCheck } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { enrolVisit, getVisitDetail } from '@/api/api'
import { ApiError, newSubmissionId } from '@/api/client'
import { lookupCedis } from '@/api/cedis'
import type { AppExclusion, ComplaintGroup, Language, VisitEnrolled } from '@/api/types'
import { QrCard } from '@/components/QrCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LANGUAGES } from '@/i18n'
import { emptyEnrol, validateEnrol, type EnrolErrors, type EnrolForm } from '@/lib/enrol'
import { clock } from '@/lib/time'
import { CedisSearch } from './CedisSearch'
import './enrol.css'

const COMPLAINTS: ComplaintGroup[] = ['chest_back_pain', 'neuro_change', 'head_injury', 'confused_drowsy', 'general']
const EXCLUSIONS: AppExclusion[] = ['child', 'pregnancy_over_20_weeks', 'self_harm_or_violence', 'major_trauma']

function reveal(element: HTMLElement | null) {
  if (!element) return
  element.focus({ preventScroll: true })
  const headerHeight = document.querySelector('.staff-header')?.getBoundingClientRect().height ?? 0
  const { top, bottom } = element.getBoundingClientRect()
  if (top < headerHeight + 16 || bottom > window.innerHeight) {
    const target = Math.max(0, window.scrollY + top - headerHeight - 16)
    if (target !== window.scrollY) window.scrollTo({ top: target, behavior: 'instant' })
  }
}

export function Enrol() {
  const { t } = useTranslation()
  const [form, setForm] = useState<EnrolForm>(emptyEnrol)
  const [offerApp, setOfferApp] = useState(true)
  const [failedSubmit, setFailedSubmit] = useState(0)
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState<VisitEnrolled | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)
  const [submissionId, setSubmissionId] = useState(newSubmissionId)
  const submitting = useRef(false)

  const mutation = useMutation({
    mutationFn: enrolVisit,
    onSuccess: setDone,
    onError: (err) => {
      const detail = err instanceof ApiError ? (err.body as { detail?: unknown } | undefined)?.detail : undefined
      setServerError(typeof detail === 'string' ? detail : t('enrol.failed'))
      setFailedSubmit((count) => count + 1)
    },
    onSettled: () => { submitting.current = false },
  })

  const detail = useQuery({
    queryKey: ['visit', done?.visit_id],
    queryFn: () => getVisitDetail(done!.visit_id),
    enabled: !!done,
  })

  useEffect(() => {
    reveal(heading.current)
  }, [done])

  useEffect(() => {
    if (failedSubmit) reveal(errorSummary.current)
  }, [failedSubmit])

  const set = <K extends keyof EnrolForm>(key: K, value: EnrolForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const mapped = lookupCedis(form.cedis_code.trim())
  const offered = offerApp && !mapped?.exclusion
  const exclusion = mapped?.exclusion ?? form.app_exclusion
  const validation = validateEnrol({ ...form, app_exclusion: offered ? null : exclusion }, submissionId)
  const errors: EnrolErrors = validation.ok ? {} : { ...validation.errors }
  if (!offered && !exclusion) {
    errors.app_exclusion = 'exclusionRequired'
    delete errors.pager_no
  }
  const messages = failedSubmit ? [
    { id: 'ctas-2', message: errors.ctas && t('enrol.errors.ctas') },
    { id: 'cedis', message: errors.cedis_code && t('enrol.errors.cedis') },
    { id: 'exclusion', message: errors.app_exclusion && t('enrol.errors.exclusionRequired') },
    { id: 'pager', message: errors.pager_no && t('enrol.errors.pagerRequired') },
    { id: 'cedis', message: errors.conflict },
  ].filter(({ message }) => !!message) : []
  const errorAt = (id: string) => messages.find((entry) => entry.id === id)?.message

  function changeCedis(value: string) {
    const entry = lookupCedis(value.trim())
    setForm((f) => ({ ...f, cedis_code: value, complaint_group: entry?.group ?? f.complaint_group }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setServerError(null)
    if (!validation.ok || errors.app_exclusion) {
      setFailedSubmit((count) => count + 1)
      return
    }
    setFailedSubmit(0)
    submitting.current = true
    mutation.mutate(validation.body)
  }

  function reset() {
    setDone(null)
    setForm(emptyEnrol)
    setOfferApp(true)
    setSubmissionId(newSubmissionId())
  }

  if (done) {
    const excluded = done.app_exclusion
    const promptDue = detail.data?.visit.next_prompt_due_at
    const staffDue = detail.data?.visit.staff_reassess_due_at
    return (
      <main id="main-content" className="enrol-page">
        <h1 ref={heading} tabIndex={-1} className="enrol-title">{t('enrol.doneTitle')}</h1>
        {excluded ? (
          <Card className="space-y-2 p-4 sm:p-6">
            <UserRoundCheck aria-hidden className="size-6 text-brand-600" />
            <h2 className="enrol-section-title">{t('enrol.noQr', { reason: t(`exclusion.${excluded}`) })}</h2>
            <p className="text-muted">{t('enrol.excludedHelp')}</p>
          </Card>
        ) : done.link && (
          <div className="space-y-3">
            <QrCard title={t('enrol.qrTitle')} hint={t('enrol.qrHint')} link={done.link} enrolment />
            <p className="text-sm text-muted">{t('enrol.showAgain')}</p>
            {done.pager_no && <p className="text-sm text-muted">{t('enrol.pagerFallback', { pager: done.pager_no })}</p>}
          </div>
        )}
        {(promptDue || staffDue) && (
          <Card className="no-print p-4 sm:p-6">
            <h2 className="enrol-section-title">{t('visit.timers')}</h2>
            <dl className="mt-3 space-y-2">
              {promptDue && <div className="flex flex-wrap justify-between gap-x-4"><dt>{t('visit.nextPrompt')}</dt><dd className="tabular font-semibold">{clock(promptDue)}</dd></div>}
              {staffDue && <div className="flex flex-wrap justify-between gap-x-4"><dt>{t('visit.nextReassess')}</dt><dd className="tabular font-semibold">{clock(staffDue)}</dd></div>}
            </dl>
          </Card>
        )}
        <div className="no-print flex flex-wrap items-center gap-3">
          {!excluded && done.link && (
            <Button className="enrol-primary" onClick={() => window.print()}>
              <Printer aria-hidden className="size-5" />
              {t('enrol.print')}
            </Button>
          )}
          <Link to={`/staff/visits/${done.visit_id}`} className="enrol-action-link">{t('enrol.openVisit')}</Link>
          <Button className="enrol-secondary" variant="secondary" onClick={reset}>{t('enrol.another')}</Button>
        </div>
      </main>
    )
  }

  const ctasError = errorAt('ctas-2')
  const exclusionError = errorAt('exclusion')
  const pagerError = errorAt('pager')
  return (
    <main id="main-content" className="enrol-page">
      <h1 ref={heading} tabIndex={-1} className="enrol-title">{t('pages.enrol')}</h1>
      <form onSubmit={submit} noValidate>
        {(messages.length > 0 || serverError) && (
          <div ref={errorSummary} tabIndex={-1} aria-labelledby="enrol-error-title" className="enrol-error-summary">
            <h2 id="enrol-error-title" className="enrol-section-title">{t('enrol.errorTitle')}</h2>
            {messages.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 ps-5">
                {messages.map(({ id, message }) => (
                  <li key={id}><a href={`#${id}`} className="underline" onClick={(event) => {
                    event.preventDefault()
                    reveal(document.getElementById(id))
                  }}>{message}</a></li>
                ))}
              </ul>
            )}
            {serverError && <p className="mt-2">{serverError}</p>}
          </div>
        )}
        <fieldset disabled={mutation.isPending} className="enrol-form">
          <Card className="enrol-group">
            <section aria-labelledby="enrol-details-title" className="enrol-fields">
              <h2 id="enrol-details-title" className="enrol-section-title">{t('enrol.detailsTitle')}</h2>
              <fieldset aria-describedby={ctasError ? 'ctas-error' : undefined}>
                <legend className="enrol-label">{t('enrol.ctas')}</legend>
                <div className="enrol-segments" data-invalid={!!ctasError}>
                  {[2, 3, 4, 5].map((n) => (
                    <label key={n} className="enrol-segment">
                      <input id={`ctas-${n}`} type="radio" name="ctas" value={n} checked={form.ctas === n}
                        aria-invalid={!!ctasError} onChange={() => set('ctas', n)} className="sr-only" />
                      {n}
                    </label>
                  ))}
                </div>
                {ctasError && <p id="ctas-error" className="enrol-error">{ctasError}</p>}
              </fieldset>

              <CedisSearch value={form.cedis_code} onChange={changeCedis} error={errorAt('cedis')} />
              <div>
                <label htmlFor="complaint" className="enrol-label">{t('enrol.complaint')}</label>
                <select id="complaint" className="field" value={form.complaint_group} disabled={!!mapped?.group}
                  aria-describedby={mapped?.group ? 'complaint-locked' : undefined}
                  onChange={(event) => set('complaint_group', event.target.value as ComplaintGroup)}>
                  {COMPLAINTS.map((group) => <option key={group} value={group}>{t(`complaint.${group}`)}</option>)}
                </select>
                {mapped?.group && <p id="complaint-locked" className="enrol-help enrol-lock"><Lock aria-hidden />{t('enrol.groupLocked')}</p>}
              </div>
            </section>
          </Card>

          <Card className="enrol-group">
            <section aria-labelledby="enrol-eligibility-title" className="enrol-fields">
              <h2 id="enrol-eligibility-title" className="enrol-section-title">{t('enrol.eligibilityTitle')}</h2>
              <div>
                <label className="enrol-switch-row">
                  {t('enrol.appOffered')}
                  <input type="checkbox" role="switch" checked={offered} disabled={!!mapped?.exclusion}
                    className="sr-only" aria-describedby={mapped?.exclusion ? 'exclusion-locked' : undefined}
                    onChange={(event) => setOfferApp(event.target.checked)} />
                  <span aria-hidden className="enrol-switch" />
                </label>
                <details className="enrol-disclosure">
                  <summary>
                    <Check aria-hidden />
                    <span>{t('enrol.exclusionDisclosure')}</span>
                    <ChevronDown aria-hidden className="enrol-chevron" />
                  </summary>
                  <ul className="list-disc space-y-1 pb-2 ps-7">
                    {EXCLUSIONS.map((reason) => <li key={reason}>{t(`exclusion.${reason}`)}</li>)}
                  </ul>
                </details>
              </div>
              {!offered && (
                <div>
                  <label htmlFor="exclusion" className="enrol-label">{t('enrol.exclusionReason')}</label>
                  <select id="exclusion" className="field" value={exclusion ?? ''} disabled={!!mapped?.exclusion}
                    aria-invalid={!!exclusionError}
                    aria-describedby={['exclusion-help', exclusionError && 'exclusion-error', mapped?.exclusion && 'exclusion-locked'].filter(Boolean).join(' ')}
                    onChange={(event) => set('app_exclusion', (event.target.value || null) as AppExclusion | null)}>
                    <option value="">{t('enrol.chooseExclusion')}</option>
                    {EXCLUSIONS.map((reason) => <option key={reason} value={reason}>{t(`exclusion.${reason}`)}</option>)}
                  </select>
                  {exclusionError && <p id="exclusion-error" className="enrol-error">{exclusionError}</p>}
                  {mapped?.exclusion && <p id="exclusion-locked" className="enrol-help enrol-lock"><Lock aria-hidden />{t('enrol.exclusionLocked')}</p>}
                  <p id="exclusion-help" className="enrol-help">{t('enrol.exclusionHelp')}</p>
                </div>
              )}
            </section>
          </Card>

          <Card className="enrol-group">
            <section aria-labelledby="enrol-delivery-title" className="enrol-fields">
              <h2 id="enrol-delivery-title" className="enrol-section-title">{t('enrol.deliveryTitle')}</h2>
              <div>
                <label htmlFor="language" className="enrol-label">{t('enrol.language')}</label>
                <select id="language" className="field" value={form.language} onChange={(event) => set('language', event.target.value as Language)}>
                  {LANGUAGES.map((language) => <option key={language} value={language}>{t(`languageName.${language}`)}</option>)}
                </select>
              </div>
              {offered && (
                <fieldset>
                  <legend className="enrol-label">{t('enrol.channel')}</legend>
                  <div className="enrol-segments">
                    {(['phone', 'pager'] as const).map((channel) => (
                      <label key={channel} className="enrol-segment">
                        <input type="radio" name="channel" checked={form.channel === channel}
                          onChange={() => set('channel', channel)} className="sr-only" />
                        {t(`channel.${channel}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {offered && form.channel === 'pager' && (
                <div>
                  <label htmlFor="pager" className="enrol-label">{t('enrol.pagerNo')}</label>
                  <input id="pager" inputMode="numeric" maxLength={6} className="field" value={form.pager_no}
                    onChange={(event) => set('pager_no', event.target.value)} aria-invalid={!!pagerError}
                    aria-describedby={pagerError ? 'pager-error' : undefined} />
                  {pagerError && <p id="pager-error" className="enrol-error">{pagerError}</p>}
                </div>
              )}
            </section>
          </Card>
        </fieldset>
        <Button type="submit" size="lg" className="enrol-primary w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t('common.sending') : offered ? t('enrol.submit') : t('enrol.submitNoQr')}
        </Button>
        <p className="sr-only" role="status">{mutation.isPending ? t('common.sending') : ''}</p>
      </form>
    </main>
  )
}
