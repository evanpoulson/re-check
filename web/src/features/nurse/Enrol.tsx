import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowRight, Download, Lock, Printer, UserRoundCheck } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { enrolVisit, getVisitDetail } from '@/api/api'
import { ApiError, newSubmissionId } from '@/api/client'
import { exclusionForCedis, lookupCedis } from '@/api/cedis'
import type { AppExclusion, ComplaintGroup, Language, VisitEnrolled } from '@/api/types'
import { QrCard } from '@/components/QrCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LANGUAGES } from '@/i18n'
import { COMPLAINT_GROUPS as COMPLAINTS, emptyEnrol, validateEnrol, type EnrolErrors, type EnrolForm } from '@/lib/enrol'
import { focusHeading, usePageTitle } from '@/lib/page'
import { clock, formatMinutes, untilMs, useNow } from '@/lib/time'
import { cn } from '@/lib/utils'
import { CedisCombobox } from './CedisCombobox'

const EXCLUSIONS: AppExclusion[] = ['child', 'pregnancy_over_20_weeks', 'self_harm_or_violence', 'major_trauma']
const FIELD = 'field'
const LABEL = 'mb-1.5 block text-small font-semibold'
// Apple-style segmented control. The radio stays in the tab order; the selected
// segment is the blue selection fill with heavier text, so it never relies on hue alone.
const SEGMENT =
  'relative flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-tap px-1 sm:px-4 text-small font-medium transition-colors has-[:checked]:bg-brand-500 has-[:checked]:font-semibold has-[:checked]:text-white has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500/60'
const ERROR = 'mt-1.5 text-small font-semibold text-level-red'
const LINK_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-tap border border-brand-500 bg-surface px-5 text-lead font-medium tracking-[-0.01em] text-brand-600 transition-colors hover:bg-brand-50'
const QR_SVG_ID = 'enrol-qr'

/** The id of the panel's heading, on the form and on "Visit created", so the sheet is named by whichever shows. */
export const ENROL_HEADING_ID = 'enrol-heading'

/** Scrolls the sheet (or, outside one, the page) back to its top. */
function scrollToTop(from: HTMLElement | null) {
  const box = from?.closest('.sheet-body')
  if (box) box.scrollTop = 0
  else window.scrollTo(0, 0)
}

type Field = 'ctas' | 'cedis_code' | 'pager_no' | 'conflict'
/** Where each error links to in the summary. CTAS links to its first choice. */
const TARGET: Record<Exclude<Field, 'conflict'>, string> = { ctas: 'ctas-2', cedis_code: 'cedis', pager_no: 'pager' }

/** The fields that had an error at the last submit. Their error lines keep their space until the next submit. */
type Submitted = Partial<Record<Field, true>>

export function Enrol({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<EnrolForm>(emptyEnrol)
  const [errors, setErrors] = useState<EnrolErrors>({})
  // The error summary is a snapshot from the last submit, as in the GOV.UK pattern.
  const [summary, setSummary] = useState<EnrolErrors | null>(null)
  const [submitted, setSubmitted] = useState<Submitted>({})
  const [attempt, setAttempt] = useState(0)
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState<{ visit: VisitEnrolled; pager: boolean } | null>(null)
  // Created once and reused on retry, so a double submit cannot enrol two visits.
  const submissionId = useRef(newSubmissionId())
  const heading = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const shown = useRef(false)
  const pageTitle = done ? t('enrol.doneTitle') : t('pages.enrol')
  usePageTitle(summary ? t('enrol.errorTitle', { title: pageTitle }) : pageTitle)

  // "Visit created" and "Enrol another" swap the panel in place: open each at the top, heading focused.
  useEffect(() => {
    if (!shown.current) {
      shown.current = true
      return
    }
    scrollToTop(heading.current)
    focusHeading(heading.current)
  }, [done])

  // A failed submit moves focus to the error summary at the top.
  useEffect(() => {
    if (attempt === 0 || !summaryRef.current) return
    scrollToTop(summaryRef.current)
    summaryRef.current.focus({ preventScroll: true })
  }, [attempt])

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

  /** Clears a field's error as soon as the nurse changes it. Its line keeps its space, so nothing jumps. */
  function clear(...fields: Field[]) {
    setErrors((e) => {
      const next = { ...e }
      for (const f of fields) {
        delete next[f]
        if (f === 'conflict') delete next.conflictField
      }
      return next
    })
  }

  const set = <K extends keyof EnrolForm>(key: K, value: EnrolForm[K], ...fields: Field[]) => {
    setForm((f) => ({ ...f, [key]: value }))
    clear(...fields)
  }

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
    clear('cedis_code', 'conflict')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)
    const result = validateEnrol(form, submissionId.current)
    if (!result.ok) {
      setErrors(result.errors)
      setSummary(result.errors)
      setSubmitted(Object.fromEntries((['ctas', 'cedis_code', 'pager_no', 'conflict'] as const).filter((f) => result.errors[f]).map((f) => [f, true])))
      setAttempt((n) => n + 1)
      return
    }
    setErrors({})
    setSummary(null)
    setSubmitted({})
    mutation.mutate(result.body)
  }

  function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    el.focus({ preventScroll: true })
  }

  /** The inline error line. Once shown, it keeps its height until the next submit, even after the error clears. */
  function errorLine(field: Field, id: string, children: React.ReactNode) {
    if (!submitted[field]) return null
    return (
      <p id={id} className={cn(ERROR, 'min-h-[1.5em]')}>
        {errors[field] ? (
          <>
            <span className="sr-only">{t('enrol.errorPrefix')} </span>
            {children}
          </>
        ) : null}
      </p>
    )
  }

  if (done) return <Done done={done} heading={heading} onClose={onClose} onAnother={() => {
    setDone(null)
    setForm(emptyEnrol)
    setErrors({})
    setSummary(null)
    setSubmitted({})
  }} />

  const summaryItems: { text: string; target: string }[] = []
  if (summary?.ctas) summaryItems.push({ text: t('enrol.errors.ctas'), target: TARGET.ctas })
  if (summary?.cedis_code) summaryItems.push({ text: t('enrol.errors.cedis'), target: TARGET.cedis_code })
  if (summary?.conflict) summaryItems.push({ text: summary.conflict, target: summary.conflictField ?? 'complaint' })
  if (summary?.pager_no) summaryItems.push({ text: t('enrol.errors.pagerRequired'), target: TARGET.pager_no })

  const conflictAt = summary?.conflictField ?? 'complaint'
  const conflictOn = (f: 'complaint' | 'exclusion') => !!errors.conflict && (errors.conflictField ?? 'complaint') === f

  return (
    <div className="sheet-content">
      <header className="sheet-heading">
        <h2 id={ENROL_HEADING_ID} ref={heading}>{t('pages.enrol')}</h2>
      </header>
      {summary && summaryItems.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="error-summary-title"
          className="mb-6 rounded-card border-2 border-level-red bg-surface p-5 focus-visible:outline-3 focus:outline-3 focus:outline-offset-2 focus:outline-brand-500/60 sm:p-6"
        >
          <h3 id="error-summary-title" className="text-title font-semibold">{t('enrol.errorSummary')}</h3>
          <ul className="mt-3 space-y-2">
            {summaryItems.map((item) => (
              <li key={item.target + item.text}>
                <a href={`#${item.target}`} onClick={(e) => jump(e, item.target)} className="font-semibold text-level-red underline underline-offset-4">
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Card className="p-5 sm:p-7">
        <form onSubmit={submit} noValidate className="space-y-7">
          <fieldset aria-describedby={cn('ctas-help', submitted.ctas && 'ctas-error')}>
            <legend className={LABEL}>{t('enrol.ctas')}</legend>
            <div className={cn('flex gap-1 rounded-tap bg-canvas p-1', errors.ctas && 'ring-2 ring-level-red')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={cn(SEGMENT, n === 1 ? 'cursor-not-allowed text-muted/60' : 'hover:not-has-checked:bg-surface')}>
                  <input
                    type="radio"
                    id={`ctas-${n}`}
                    name="ctas"
                    value={n}
                    disabled={n === 1}
                    checked={form.ctas === n}
                    onChange={() => set('ctas', n, 'ctas')}
                    className="sr-only"
                  />
                  {n}
                </label>
              ))}
            </div>
            <p id="ctas-help" className="mt-1.5 text-small text-muted">{t('enrol.ctas1')}</p>
            {errorLine('ctas', 'ctas-error', t('enrol.errors.ctas'))}
          </fieldset>

          <div>
            <label htmlFor="cedis" className={LABEL}>{t('enrol.cedis')}</label>
            <CedisCombobox
              id="cedis"
              value={form.cedis_code}
              onChange={changeCedis}
              invalid={!!errors.cedis_code}
              describedBy={cn('cedis-help', submitted.cedis_code && 'cedis-error')}
            />
            <p id="cedis-help" className="mt-1.5 text-small text-muted">
              {mapped ? `${mapped.code}: ${mapped.name}` : t('enrol.cedisHelp')}
            </p>
            {errorLine('cedis_code', 'cedis-error', t('enrol.errors.cedis'))}
          </div>

          <div>
            <label htmlFor="complaint" className={LABEL}>{t('enrol.complaint')}</label>
            <select
              id="complaint"
              className={cn(FIELD, 'select')}
              value={form.complaint_group}
              disabled={groupLocked}
              aria-invalid={conflictOn('complaint')}
              aria-describedby={cn(groupLocked && 'complaint-locked', submitted.conflict && conflictAt === 'complaint' && 'conflict-error') || undefined}
              onChange={(e) => set('complaint_group', e.target.value as ComplaintGroup, 'conflict')}
            >
              {COMPLAINTS.map((c) => (
                <option key={c} value={c}>{t(`complaint.${c}`)}</option>
              ))}
            </select>
            {conflictAt === 'complaint' && errorLine('conflict', 'conflict-error', errors.conflict)}
            {groupLocked && (
              <p id="complaint-locked" className="mt-1.5 flex items-center gap-1.5 text-small text-muted">
                <Lock aria-hidden className="size-3.5 shrink-0" />
                {t('enrol.groupLocked')}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="exclusion" className={LABEL}>{t('enrol.exclusion')}</label>
            <select
              id="exclusion"
              className={cn(FIELD, 'select')}
              value={form.app_exclusion ?? ''}
              aria-invalid={conflictOn('exclusion')}
              aria-describedby={submitted.conflict && conflictAt === 'exclusion' ? 'conflict-error' : undefined}
              onChange={(e) => set('app_exclusion', (e.target.value || null) as AppExclusion | null, 'conflict')}
            >
              <option value="">{t('enrol.appOffered')}</option>
              {EXCLUSIONS.map((x) => (
                <option key={x} value={x}>{t('enrol.notOffered', { reason: t(`exclusion.${x}`) })}</option>
              ))}
            </select>
            {form.app_exclusion && <p className="mt-1.5 text-small text-muted">{t('enrol.exclusionHelp')}</p>}
            {conflictAt === 'exclusion' && errorLine('conflict', 'conflict-error', errors.conflict)}
          </div>

          <div>
            <label htmlFor="language" className={LABEL}>{t('enrol.language')}</label>
            <select id="language" className={cn(FIELD, 'select')} value={form.language} onChange={(e) => set('language', e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{t(`languageName.${l}`)}</option>
              ))}
            </select>
          </div>

          {form.app_exclusion === null && (
            <>
              <fieldset>
                <legend className={LABEL}>{t('enrol.channel')}</legend>
                <div className="flex gap-1 rounded-tap bg-canvas p-1">
                  {(['phone', 'pager'] as const).map((c) => (
                    <label key={c} className={`${SEGMENT} hover:not-has-checked:bg-surface`}>
                      <input type="radio" name="channel" checked={form.channel === c} onChange={() => set('channel', c, 'pager_no')} className="sr-only" />
                      {t(`channel.${c}`)}
                    </label>
                  ))}
                </div>
              </fieldset>

              {form.channel === 'pager' && (
                <div>
                  <label htmlFor="pager" className={LABEL}>{t('enrol.pagerNo')}</label>
                  <input
                    id="pager"
                    inputMode="numeric"
                    maxLength={6}
                    className={FIELD}
                    value={form.pager_no}
                    onChange={(e) => set('pager_no', e.target.value, 'pager_no')}
                    aria-invalid={!!errors.pager_no}
                    aria-describedby={submitted.pager_no ? 'pager-error' : undefined}
                  />
                  {errorLine('pager_no', 'pager-error', t('enrol.errors.pagerRequired'))}
                </div>
              )}
            </>
          )}

          {serverError && <p role="alert" className={ERROR}>{serverError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.sending') : form.app_exclusion ? t('enrol.submitNoQr') : t('enrol.submit')}
          </Button>
        </form>
      </Card>
    </div>
  )
}

/** "Visit created": the QR, when the first prompt and the staff reassessment are due, and what to do next. */
function Done({
  done: { visit, pager },
  heading,
  onClose,
  onAnother,
}: {
  done: { visit: VisitEnrolled; pager: boolean }
  heading: React.RefObject<HTMLHeadingElement | null>
  onClose: () => void
  onAnother: () => void
}) {
  const { t } = useTranslation()
  const now = useNow()
  const excluded = visit.app_exclusion
  const ref = `P-${visit.visit_id.slice(0, 4)}`
  // The enrol response has no due times, so read them from the visit itself.
  const detail = useQuery({ queryKey: ['visit', visit.visit_id], queryFn: () => getVisitDetail(visit.visit_id) })
  const summary = detail.data?.visit

  const due = (iso: string | null | undefined) => {
    if (!iso) return null
    const ms = untilMs(iso, now) ?? 0
    return t('enrol.dueAt', { time: clock(iso), rel: ms > 0 ? t('time.in', { value: formatMinutes(ms) }) : t('time.overdue', { value: formatMinutes(ms) }) })
  }

  function save() {
    const svg = document.getElementById(QR_SVG_ID)
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `recheck-${ref}-qr.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="sheet-content space-y-6">
      <header className="sheet-heading">
        <h2 id={ENROL_HEADING_ID} ref={heading}>{t('enrol.doneTitle')}</h2>
        <p>{t('enrol.doneRef', { ref })}</p>
      </header>
      <dl className="no-print mx-auto grid max-w-sm gap-x-4 gap-y-2 rounded-card bg-surface p-5 text-small shadow-card sm:grid-cols-[auto_1fr]">
        {!excluded && (
          <>
            <dt className="font-semibold">{t('enrol.firstPrompt')}</dt>
            <dd className="tabular text-muted sm:text-end">{summary ? due(summary.next_prompt_due_at) ?? t('common.none') : t('common.loading')}</dd>
          </>
        )}
        <dt className="font-semibold">{t('enrol.staffReassess')}</dt>
        <dd className="tabular text-muted sm:text-end">{summary ? due(summary.staff_reassess_due_at) ?? t('common.none') : t('common.loading')}</dd>
      </dl>
      {excluded ? (
        <Card className="space-y-3 text-center">
          <span aria-hidden className="mx-auto flex size-14 items-center justify-center rounded-full bg-canvas text-ink">
            <UserRoundCheck className="size-7" />
          </span>
          <p className="text-title font-semibold">{t('enrol.noQr', { reason: t(`exclusion.${excluded}`) })}</p>
          <p className="text-muted">{t('enrol.excludedHelp')}</p>
        </Card>
      ) : (
        <div className="mx-auto max-w-sm space-y-3">
          {visit.link && <QrCard title={t('enrol.qrTitle')} hint={t('enrol.qrHint')} link={visit.link} heading="h3" svgId={QR_SVG_ID} />}
          <p className="text-center text-muted">
            {t('enrol.showAgain')}
            {pager ? ` ${t('enrol.pagerFallback', { pager: visit.pager_no ?? '' })}` : ''}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 no-print">
        <Link to={`/staff/visits/${visit.visit_id}`} state={{ from: '/staff/triage' }} className={cn(LINK_BUTTON, 'border-transparent bg-brand-500 text-white hover:bg-brand-700')}>
          {t('enrol.openVisit')}
          <ArrowRight aria-hidden className="size-5 rtl:-scale-x-100" />
        </Link>
        {!excluded && (
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer aria-hidden className="size-5" />
              {t('enrol.print')}
            </Button>
            <Button variant="secondary" onClick={save}>
              <Download aria-hidden className="size-5" />
              {t('enrol.save')}
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={onAnother}>{t('enrol.another')}</Button>
        <Button variant="ghost" onClick={onClose}>{t('visit.back')}</Button>
      </div>
    </div>
  )
}
