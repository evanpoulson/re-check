import { useMutation } from '@tanstack/react-query'
import { Printer, UserRoundCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { enrolVisit } from '@/api/api'
import { ApiError, newSubmissionId } from '@/api/client'
import { cedisEntries, exclusionForCedis, lookupCedis } from '@/api/cedis'
import type { AppExclusion, ComplaintGroup, Language, VisitEnrolled } from '@/api/types'
import { QrCard } from '@/components/QrCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LANGUAGES } from '@/i18n'
import { COMPLAINT_GROUPS as COMPLAINTS, emptyEnrol, validateEnrol, type EnrolErrors, type EnrolForm } from '@/lib/enrol'
import { focusHeading, usePageTitle } from '@/lib/page'

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
  const [errors, setErrors] = useState<EnrolErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState<{ visit: VisitEnrolled; pager: boolean } | null>(null)
  // Created once and reused on retry, so a double submit cannot enrol two visits.
  const submissionId = useRef(newSubmissionId())
  const heading = useRef<HTMLHeadingElement>(null)
  const shown = useRef(false)
  usePageTitle(done ? t('enrol.doneTitle') : t('pages.enrol'))

  // "Visit created" and "Enrol another" swap the page in place: open each at the top, heading focused.
  useEffect(() => {
    if (!shown.current) {
      shown.current = true
      return
    }
    window.scrollTo(0, 0)
    focusHeading(heading.current)
  }, [done])

  const mutation = useMutation({
    mutationFn: enrolVisit,
    onSuccess: (visit) => {
      setDone({ visit, pager: form.channel === 'pager' && form.app_exclusion === null })
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

  function changeCedis(value: string) {
    const code = value.trim()
    const entry = lookupCedis(code)
    setForm((f) => ({
      ...f,
      cedis_code: value,
      complaint_group: entry?.group ?? f.complaint_group,
      app_exclusion: entry?.exclusion ?? (exclusionForCedis(f.cedis_code.trim()) ? null : f.app_exclusion),
    }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)
    const result = validateEnrol(form, submissionId.current)
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    mutation.mutate(result.body)
  }

  if (done) {
    const { visit, pager } = done
    const excluded = visit.app_exclusion
    return (
      <main id="main-content" className="mx-auto max-w-4xl space-y-8 px-4 py-12 sm:px-6">
        <h1 ref={heading} className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">{t('enrol.doneTitle')}</h1>
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
      <h1 ref={heading} className="mb-8 text-center text-4xl font-semibold tracking-tight sm:text-5xl">{t('pages.enrol')}</h1>
      <Card className="p-6 sm:p-10">
        <form onSubmit={submit} noValidate className="space-y-7">
          <fieldset>
            <legend className={LABEL}>{t('enrol.ctas')}</legend>
            <div className="flex gap-1 rounded-tap bg-canvas p-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={`${SEGMENT} ${n === 1 ? 'cursor-not-allowed text-muted line-through' : 'hover:not-has-checked:bg-surface'}`}>
                  <input type="radio" name="ctas" value={n} disabled={n === 1} checked={form.ctas === n} onChange={() => set('ctas', n)} className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-sm text-muted">{t('enrol.ctas1')}</p>
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

          <div>
            <label htmlFor="exclusion" className={LABEL}>{t('enrol.exclusion')}</label>
            <select id="exclusion" className={FIELD} value={form.app_exclusion ?? ''} onChange={(e) => set('app_exclusion', (e.target.value || null) as AppExclusion | null)}>
              <option value="">{t('enrol.appOffered')}</option>
              {EXCLUSIONS.map((x) => (
                <option key={x} value={x}>{t('enrol.notOffered', { reason: t(`exclusion.${x}`) })}</option>
              ))}
            </select>
            {form.app_exclusion && <p className="mt-1.5 text-sm text-muted">{t('enrol.exclusionHelp')}</p>}
          </div>

          <div>
            <label htmlFor="language" className={LABEL}>{t('enrol.language')}</label>
            <select id="language" className={FIELD} value={form.language} onChange={(e) => set('language', e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{t(`languageName.${l}`)}</option>
              ))}
            </select>
          </div>

          {form.app_exclusion === null && (
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
            {mutation.isPending ? t('common.sending') : form.app_exclusion ? t('enrol.submitNoQr') : t('enrol.submit')}
          </Button>
        </form>
      </Card>
    </main>
  )
}
