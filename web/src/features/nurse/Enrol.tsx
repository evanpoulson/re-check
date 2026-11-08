import { useMutation } from '@tanstack/react-query'
import { Printer, UserRoundCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { enrolVisit } from '@/api/api'
import { ApiError, newSubmissionId } from '@/api/client'
import { cedisEntries, exclusionForCedis, lookupCedis } from '@/api/cedis'
import type { AppExclusion, ComplaintGroup, Language, VisitEnrolled } from '@/api/types'
import { QrCard } from '@/components/QrCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { emptyEnrol, validateEnrol, type EnrolErrors, type EnrolForm } from '@/lib/enrol'

const COMPLAINTS: ComplaintGroup[] = ['chest_back_pain', 'neuro_change', 'head_injury', 'confused_drowsy', 'general']
const LANGUAGES: Language[] = ['en', 'pa', 'tl']
const EXCLUSIONS: AppExclusion[] = ['child', 'pregnancy_over_20_weeks', 'self_harm_or_violence', 'major_trauma']
const FIELD = 'min-h-11 w-full rounded-data border border-ink bg-surface px-3 text-base'

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
      <main className="mx-auto max-w-4xl space-y-5 p-6">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('enrol.doneTitle')}</h1>
        {excluded ? (
          <Card className="space-y-2 border-l-[10px] border-l-brand-600">
            <p className="flex items-center gap-2 text-xl font-bold">
              <UserRoundCheck aria-hidden className="size-6" />
              {t('enrol.noQr', { reason: t(`exclusion.${excluded}`) })}
            </p>
            <p>{t('enrol.excludedHelp')}</p>
          </Card>
        ) : (
          <>
            <div className="max-w-sm">
              {visit.link && <QrCard title={t('enrol.qrTitle')} hint={t('enrol.qrHint')} link={visit.link} />}
            </div>
            <p className="text-muted">
              {t('enrol.showAgain')}
              {pager ? ` ${t('enrol.pagerFallback', { pager: visit.pager_no ?? '' })}` : ''}
            </p>
          </>
        )}
        <div className="flex gap-3 no-print">
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
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">{t('pages.enrol')}</h1>
      <Card>
        <form onSubmit={submit} noValidate className="space-y-5">
          <fieldset>
            <legend className="mb-2 font-bold">{t('enrol.ctas')}</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className={`flex min-h-11 min-w-14 items-center justify-center gap-2 rounded-tap border-2 px-3 font-bold ${
                    n === 1 ? 'cursor-not-allowed border-line bg-canvas text-muted' : 'cursor-pointer border-ink'
                  } ${form.ctas === n ? 'bg-brand-50' : ''}`}
                >
                  <input type="radio" name="ctas" value={n} disabled={n === 1} checked={form.ctas === n} onChange={() => set('ctas', n)} className="size-4" />
                  {n}
                </label>
              ))}
            </div>
            <p className="mt-1 text-sm text-muted">{t('enrol.ctas1')}</p>
            {errors.ctas && <p role="alert" className="mt-1 font-bold text-level-red">{t('enrol.errors.ctas')}</p>}
          </fieldset>

          <div>
            <label htmlFor="cedis" className="mb-1 block font-bold">{t('enrol.cedis')}</label>
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
            <p id="cedis-help" className="mt-1 text-sm text-muted">
              {mapped ? `${mapped.code}: ${mapped.name}` : t('enrol.cedisHelp')}
            </p>
            {errors.cedis_code && <p role="alert" className="mt-1 font-bold text-level-red">{t('enrol.errors.cedis')}</p>}
          </div>

          <div>
            <label htmlFor="complaint" className="mb-1 block font-bold">{t('enrol.complaint')}</label>
            <select id="complaint" className={FIELD} value={form.complaint_group} disabled={groupLocked} onChange={(e) => set('complaint_group', e.target.value as ComplaintGroup)}>
              {COMPLAINTS.map((c) => (
                <option key={c} value={c}>{t(`complaint.${c}`)}</option>
              ))}
            </select>
            {groupLocked && <p className="mt-1 text-sm text-muted">{t('enrol.groupLocked')}</p>}
          </div>

          <div>
            <label htmlFor="exclusion" className="mb-1 block font-bold">{t('enrol.exclusion')}</label>
            <select id="exclusion" className={FIELD} value={form.app_exclusion ?? ''} onChange={(e) => set('app_exclusion', (e.target.value || null) as AppExclusion | null)}>
              <option value="">{t('enrol.appOffered')}</option>
              {EXCLUSIONS.map((x) => (
                <option key={x} value={x}>{t('enrol.notOffered', { reason: t(`exclusion.${x}`) })}</option>
              ))}
            </select>
            {form.app_exclusion && <p className="mt-1 text-sm text-muted">{t('enrol.exclusionHelp')}</p>}
          </div>

          <div>
            <label htmlFor="language" className="mb-1 block font-bold">{t('enrol.language')}</label>
            <select id="language" className={FIELD} value={form.language} onChange={(e) => set('language', e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{t(`language.${l}`)}</option>
              ))}
            </select>
          </div>

          {form.app_exclusion === null && (
            <>
              <fieldset>
                <legend className="mb-2 font-bold">{t('enrol.channel')}</legend>
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
                  <label htmlFor="pager" className="mb-1 block font-bold">{t('enrol.pagerNo')}</label>
                  <input id="pager" inputMode="numeric" maxLength={6} className={FIELD} value={form.pager_no} onChange={(e) => set('pager_no', e.target.value)} aria-invalid={!!errors.pager_no} />
                  {errors.pager_no && <p role="alert" className="mt-1 font-bold text-level-red">{t('enrol.errors.pagerRequired')}</p>}
                </div>
              )}
            </>
          )}

          {errors.conflict && <p role="alert" className="font-bold text-level-red">{errors.conflict}</p>}
          {serverError && <p role="alert" className="font-bold text-level-red">{serverError}</p>}
          <Button type="submit" size="lg" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.sending') : form.app_exclusion ? t('enrol.submitNoQr') : t('enrol.submit')}
          </Button>
        </form>
      </Card>
    </main>
  )
}
