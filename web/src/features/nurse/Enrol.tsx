import { useMutation } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { enrolVisit } from '@/api/api'
import { ApiError, newSubmissionId } from '@/api/client'
import type { ComplaintGroup, Language, VisitEnrolled } from '@/api/types'
import { QrCard } from '@/components/QrCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { emptyEnrol, validateEnrol, type EnrolErrors, type EnrolForm } from '@/lib/enrol'
import { clock } from '@/lib/time'

const COMPLAINTS: ComplaintGroup[] = ['chest_back_pain', 'neuro_change', 'head_injury', 'general']
const LANGUAGES: Language[] = ['en', 'pa', 'tl']
const FIELD = 'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base'

export function Enrol() {
  const { t } = useTranslation()
  const [form, setForm] = useState<EnrolForm>(emptyEnrol)
  const [errors, setErrors] = useState<EnrolErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState<{ visit: VisitEnrolled; pager: boolean } | null>(null)
  // Created once and reused on retry, so a double submit cannot enrol two visits.
  const submissionId = useRef(newSubmissionId())

  const mutation = useMutation({
    mutationFn: enrolVisit,
    onSuccess: (visit) => {
      setDone({ visit, pager: form.channel === 'pager' })
      submissionId.current = newSubmissionId()
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? (err.body as { detail?: string } | undefined)?.detail : undefined
      setServerError(detail ?? t('enrol.failed'))
    },
  })

  const set = <K extends keyof EnrolForm>(key: K, value: EnrolForm[K]) => setForm((f) => ({ ...f, [key]: value }))

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
    return (
      <main className="mx-auto max-w-4xl space-y-5 p-6">
        <h1 className="text-2xl font-bold">{t('enrol.doneTitle')}</h1>
        <p role="alert" className="rounded-lg bg-level-amber-bg p-3 font-semibold text-level-amber">
          {t('enrol.shownOnce')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <QrCard title={t('enrol.patientQr')} hint={t('enrol.patientHint')} link={visit.patient_link} />
          <QrCard title={t('enrol.companionQr')} hint={t('enrol.companionHint')} link={visit.companion_link} />
        </div>
        <p className="text-muted">
          {t('enrol.expires', { time: clock(visit.links_expire_at) })}
          {pager ? ` ${t('enrol.pagerFallback', { pager: visit.pager_no ?? '' })}` : ''}
        </p>
        <div className="flex gap-3 no-print">
          <Button onClick={() => window.print()}>
            <Printer aria-hidden className="size-5" />
            {t('enrol.print')}
          </Button>
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
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold">{t('pages.enrol')}</h1>
      <Card>
        <form onSubmit={submit} noValidate className="space-y-5">
          <fieldset>
            <legend className="mb-2 font-semibold">{t('enrol.ctas')}</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className={`flex min-h-11 min-w-14 items-center justify-center gap-2 rounded-lg border-2 px-3 font-semibold ${
                    n === 1 ? 'cursor-not-allowed border-line bg-slate-100 text-muted' : 'cursor-pointer border-line'
                  } ${form.ctas === n ? 'border-brand-600 bg-brand-50' : ''}`}
                >
                  <input
                    type="radio"
                    name="ctas"
                    value={n}
                    disabled={n === 1}
                    checked={form.ctas === n}
                    onChange={() => set('ctas', n)}
                    className="size-4"
                  />
                  {n}
                </label>
              ))}
            </div>
            <p className="mt-1 text-sm text-muted">{t('enrol.ctas1')}</p>
            {errors.ctas && <p role="alert" className="mt-1 font-semibold text-level-red">{t('enrol.errors.ctas')}</p>}
          </fieldset>

          <div>
            <label htmlFor="complaint" className="mb-1 block font-semibold">{t('enrol.complaint')}</label>
            <select id="complaint" className={FIELD} value={form.complaint_group} onChange={(e) => set('complaint_group', e.target.value as ComplaintGroup)}>
              {COMPLAINTS.map((c) => (
                <option key={c} value={c}>{t(`complaint.${c}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cedis" className="mb-1 block font-semibold">{t('enrol.cedis')}</label>
            <input id="cedis" inputMode="numeric" maxLength={3} className={FIELD} value={form.cedis_code} onChange={(e) => set('cedis_code', e.target.value)} aria-invalid={!!errors.cedis_code} />
            {errors.cedis_code && <p role="alert" className="mt-1 font-semibold text-level-red">{t('enrol.errors.cedis')}</p>}
          </div>

          <div>
            <label htmlFor="language" className="mb-1 block font-semibold">{t('enrol.language')}</label>
            <select id="language" className={FIELD} value={form.language} onChange={(e) => set('language', e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{t(`language.${l}`)}</option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="mb-2 font-semibold">{t('enrol.channel')}</legend>
            <div className="flex gap-4">
              {(['phone', 'pager'] as const).map((c) => (
                <label key={c} className="flex min-h-11 items-center gap-2">
                  <input type="radio" name="channel" checked={form.channel === c} onChange={() => set('channel', c)} className="size-4" />
                  {t(`channel.${c}`)}
                </label>
              ))}
            </div>
          </fieldset>

          {form.channel === 'pager' && (
            <div>
              <label htmlFor="pager" className="mb-1 block font-semibold">{t('enrol.pagerNo')}</label>
              <input id="pager" inputMode="numeric" maxLength={6} className={FIELD} value={form.pager_no} onChange={(e) => set('pager_no', e.target.value)} aria-invalid={!!errors.pager_no} />
              {errors.pager_no && <p role="alert" className="mt-1 font-semibold text-level-red">{t('enrol.errors.pagerRequired')}</p>}
            </div>
          )}

          {serverError && <p role="alert" className="font-semibold text-level-red">{serverError}</p>}
          <Button type="submit" size="lg" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.sending') : t('enrol.submit')}
          </Button>
        </form>
      </Card>
    </main>
  )
}
