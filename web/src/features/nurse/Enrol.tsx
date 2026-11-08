import { useMutation } from '@tanstack/react-query'
import { Check, Printer, UserRoundCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { enrolVisit } from '@/api/api'
import { ApiError, newSubmissionId } from '@/api/client'
import { cedisEntries, lookupCedis } from '@/api/cedis'
import type { AppExclusion, ComplaintGroup, Language, VisitEnrolled } from '@/api/types'
import { QrCard } from '@/components/QrCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LANGUAGES } from '@/i18n'
import { emptyEnrol, validateEnrol, type EnrolErrors, type EnrolForm } from '@/lib/enrol'

const COMPLAINTS: ComplaintGroup[] = ['chest_back_pain', 'neuro_change', 'head_injury', 'confused_drowsy', 'general']
const EXCLUSIONS: AppExclusion[] = ['child', 'pregnancy_over_20_weeks', 'self_harm_or_violence', 'major_trauma']
const FIELD = 'field'
const LABEL = 'mb-1.5 block text-[0.9375rem] font-semibold'
// Apple-style segmented control. The radio stays in the tab order; the selected
// segment is a dark fill with heavier text, so it never relies on hue alone.
const SEGMENT =
  'relative flex min-h-11 min-w-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-tap px-4 text-[0.9375rem] font-medium transition-colors has-[:checked]:bg-ink has-[:checked]:font-semibold has-[:checked]:text-white has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500/60'
const ERROR = 'mt-1.5 text-[0.9375rem] font-semibold text-level-red'

export function Enrol() {
  const { t } = useTranslation()
  const [form, setForm] = useState<EnrolForm>(emptyEnrol)
  const [offerApp, setOfferApp] = useState(true)
  const [errors, setErrors] = useState<EnrolErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState<{ visit: VisitEnrolled; pager: boolean } | null>(null)
  // Created once and reused on retry, so a double submit cannot enrol two visits.
  const submissionId = useRef(newSubmissionId())

  const mutation = useMutation({
    mutationFn: enrolVisit,
    onSuccess: (visit, body) => {
      setDone({ visit, pager: body.channel === 'pager' })
      submissionId.current = newSubmissionId()
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? (err.body as { detail?: string } | undefined)?.detail : undefined
      setServerError(detail ?? t('enrol.failed'))
    },
  })

  const set = <K extends keyof EnrolForm>(key: K, value: EnrolForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  // A CEDIS code the backend's map knows picks the complaint group and may suggest an exclusion.
  const mapped = lookupCedis(form.cedis_code.trim())
  const groupLocked = !!mapped?.group
  const offered = offerApp && !mapped?.exclusion
  const exclusion = mapped?.exclusion ?? form.app_exclusion

  function changeCedis(value: string) {
    const code = value.trim()
    const entry = lookupCedis(code)
    setForm((f) => ({
      ...f,
      cedis_code: value,
      complaint_group: entry?.group ?? f.complaint_group,
    }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)
    const result = validateEnrol({ ...form, app_exclusion: offered ? null : exclusion }, submissionId.current)
    if (!offered && !exclusion) {
      return setErrors({ ...(result.ok ? {} : result.errors), app_exclusion: 'exclusionRequired' })
    }
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    mutation.mutate(result.body)
  }

  if (done) {
    const { visit, pager } = done
    const excluded = visit.app_exclusion
    return (
      <main id="main-content" className="mx-auto max-w-4xl space-y-8 px-4 py-12 sm:px-6">
        <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">{t('enrol.doneTitle')}</h1>
        {excluded ? (
          <Card className="mx-auto max-w-xl space-y-3 text-center">
            <span aria-hidden className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <UserRoundCheck className="size-7" />
            </span>
            <p className="text-xl font-semibold">
              {t('enrol.noQr', { reason: t(`exclusion.${excluded}`) })}
            </p>
            <p className="text-muted">{t('enrol.excludedHelp')}</p>
          </Card>
        ) : (
          <>
            <div className="mx-auto max-w-sm">
              {visit.link && <QrCard title={t('enrol.qrTitle')} hint={t('enrol.qrHint')} link={visit.link} />}
            </div>
            <p className="text-center text-muted">
              {t('enrol.showAgain')}
              {pager ? ` ${t('enrol.pagerFallback', { pager: visit.pager_no ?? '' })}` : ''}
            </p>
          </>
        )}
        <div className="flex flex-wrap justify-center gap-3 no-print">
          {!excluded && (
            <Button onClick={() => window.print()}>
              <Printer aria-hidden className="size-5" />
              {t('enrol.print')}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setDone(null)
              setForm(emptyEnrol)
              setOfferApp(true)
            }}
          >
            {t('enrol.another')}
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-center text-4xl font-semibold tracking-tight sm:text-5xl">{t('pages.enrol')}</h1>
      <Card className="p-6 sm:p-10">
        <form onSubmit={submit} noValidate className="space-y-7">
          <fieldset>
            <legend className={LABEL}>{t('enrol.ctas')}</legend>
            <div className="flex gap-1 rounded-tap bg-canvas p-1">
              {[2, 3, 4, 5].map((n) => (
                <label key={n} className={`${SEGMENT} hover:not-has-checked:bg-surface`}>
                  <input type="radio" name="ctas" value={n} checked={form.ctas === n} onChange={() => set('ctas', n)} className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
            {errors.ctas && <p role="alert" className={ERROR}>{t('enrol.errors.ctas')}</p>}
          </fieldset>

          <div>
            <label htmlFor="cedis" className={LABEL}>{t('enrol.cedis')}</label>
            <input
              id="cedis"
              list="cedis-list"
              inputMode="numeric"
              maxLength={3}
              className={FIELD}
              value={form.cedis_code}
              onChange={(e) => changeCedis(e.target.value)}
              aria-invalid={!!errors.cedis_code}
              aria-describedby="cedis-help"
            />
            <datalist id="cedis-list">
              {cedisEntries.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </datalist>
            <p id="cedis-help" className="mt-1.5 text-sm text-muted">
              {mapped ? `${mapped.code}: ${mapped.name}` : t('enrol.cedisHelp')}
            </p>
            {errors.cedis_code && <p role="alert" className={ERROR}>{t('enrol.errors.cedis')}</p>}
          </div>

          <div>
            <label htmlFor="complaint" className={LABEL}>{t('enrol.complaint')}</label>
            <select id="complaint" className={FIELD} value={form.complaint_group} disabled={groupLocked} onChange={(e) => set('complaint_group', e.target.value as ComplaintGroup)}>
              {COMPLAINTS.map((c) => (
                <option key={c} value={c}>{t(`complaint.${c}`)}</option>
              ))}
            </select>
            {groupLocked && <p className="mt-1.5 text-sm text-muted">{t('enrol.groupLocked')}</p>}
          </div>

          {form.complaint_group === 'general' && (
            <div>
              <label htmlFor="complaint-detail" className={LABEL}>{t('enrol.complaintDetail')}</label>
              <input id="complaint-detail" className={FIELD} maxLength={200} value={form.complaint_detail}
                onChange={(e) => set('complaint_detail', e.target.value)} aria-describedby="complaint-detail-help" />
              <p id="complaint-detail-help" className="mt-1.5 text-sm text-muted">{t('enrol.complaintDetailHelp')}</p>
            </div>
          )}

          <div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem] font-semibold has-[:disabled]:cursor-not-allowed">
              <input type="checkbox" role="switch" checked={offered} disabled={!!mapped?.exclusion}
                className="peer sr-only" onChange={(e) => setOfferApp(e.target.checked)} />
              <span aria-hidden className="relative h-6 w-11 rounded-full bg-muted after:absolute after:start-1 after:top-1 after:size-4 after:rounded-full after:bg-white peer-checked:bg-brand-600 peer-checked:after:start-6 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:opacity-60" />
              {t('enrol.appOffered')}
            </label>
            <details className="text-sm text-muted">
              <summary className="flex min-h-8 w-fit cursor-pointer list-none items-center gap-2">
                <Check aria-hidden className="size-4" />
                {t('enrol.exclusionDisclosure')}
              </summary>
              <ul className="list-disc ps-6">
                {EXCLUSIONS.map((reason) => <li key={reason}>{t(`exclusion.${reason}`)}</li>)}
              </ul>
            </details>
            {!offered && (
              <div className="mt-3">
                <label htmlFor="exclusion" className={LABEL}>{t('enrol.exclusionReason')}</label>
                <select id="exclusion" className={FIELD} value={exclusion ?? ''} disabled={!!mapped?.exclusion}
                  aria-invalid={!!errors.app_exclusion && !exclusion}
                  onChange={(e) => set('app_exclusion', (e.target.value || null) as AppExclusion | null)}>
                  <option value="">{t('enrol.chooseExclusion')}</option>
                  {EXCLUSIONS.map((reason) => <option key={reason} value={reason}>{t(`exclusion.${reason}`)}</option>)}
                </select>
                {errors.app_exclusion && !exclusion && <p role="alert" className={ERROR}>{t('enrol.errors.exclusionRequired')}</p>}
                {mapped?.exclusion && <p className="mt-1.5 text-sm text-muted">{t('enrol.groupLocked')}</p>}
                <p className="mt-1.5 text-sm text-muted">{t('enrol.exclusionHelp')}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="language" className={LABEL}>{t('enrol.language')}</label>
            <select id="language" className={FIELD} value={form.language} onChange={(e) => set('language', e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{t(`languageName.${l}`)}</option>
              ))}
            </select>
          </div>

          {offered && (
            <>
              <fieldset>
                <legend className={LABEL}>{t('enrol.channel')}</legend>
                <div className="flex max-w-xs gap-1 rounded-tap bg-canvas p-1">
                  {(['phone', 'pager'] as const).map((c) => (
                    <label key={c} className={`${SEGMENT} hover:not-has-checked:bg-surface`}>
                      <input type="radio" name="channel" checked={form.channel === c} onChange={() => set('channel', c)} className="sr-only" />
                      {t(`channel.${c}`)}
                    </label>
                  ))}
                </div>
              </fieldset>

              {form.channel === 'pager' && (
                <div>
                  <label htmlFor="pager" className={LABEL}>{t('enrol.pagerNo')}</label>
                  <input id="pager" inputMode="numeric" maxLength={6} className={FIELD} value={form.pager_no} onChange={(e) => set('pager_no', e.target.value)} aria-invalid={!!errors.pager_no} />
                  {errors.pager_no && <p role="alert" className={ERROR}>{t('enrol.errors.pagerRequired')}</p>}
                </div>
              )}
            </>
          )}

          {errors.conflict && <p role="alert" className={ERROR}>{errors.conflict}</p>}
          {serverError && <p role="alert" className={ERROR}>{serverError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.sending') : offered ? t('enrol.submit') : t('enrol.submitNoQr')}
          </Button>
        </form>
      </Card>
    </main>
  )
}
