import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, Flag, Printer, ScanLine } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  acknowledgeTask,
  assessTask,
  getVisitLink,
  postFlagHigher,
  postVitals,
  staffSignOut,
  updateVisitExclusion,
  updateVisitStatus,
} from '@/api/api'
import { ApiError, newSubmissionId } from '@/api/client'
import type { AppExclusion, Disposition, Task, VisitDetail, VisitSummary, VitalsRecord } from '@/api/types'
import { QrCard } from '@/components/QrCard'
import { Button } from '@/components/ui/button'
import { signedInText } from '@/lib/session'
import { clock } from '@/lib/time'
import { cn } from '@/lib/utils'
import { emptyVitals, validateVitals, VITALS_RANGES, vitalsText, type VitalsErrors, type VitalsField, type VitalsForm } from '@/lib/vitals'
import { rolesText } from './visit/model'
import { Note, SectionCard } from './visit/parts'

const DISPOSITIONS: Disposition[] = [
  'assessed_stable',
  'tests_ordered',
  're_triaged',
  'roomed',
  'treated_and_released',
  'left_before_assessment',
  'not_located',
]
const EXCLUSIONS: AppExclusion[] = ['child', 'pregnancy_over_20_weeks', 'self_harm_or_violence', 'major_trauma']
const FIELD = 'field'
const NOTE_MAX = 280

/** Reuse a submission ID for an unchanged retry, and rotate it after a deliberate edit. */
function useAction<A, R = unknown>(
  visitId: string,
  fn: (args: A, submissionId: string) => Promise<R>,
  onSaved?: (result: R) => void,
) {
  const qc = useQueryClient()
  const last = useRef<{ key: string | undefined; id: string } | null>(null)
  const m = useMutation({
    mutationFn: (args: A) => {
      const key = JSON.stringify(args)
      if (!last.current || last.current.key !== key) last.current = { key, id: newSubmissionId() }
      return fn(args, last.current.id)
    },
    onSuccess: async (result) => {
      last.current = null
      onSaved?.(result)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['visit', visitId] }),
        qc.invalidateQueries({ queryKey: ['board'] }),
        qc.invalidateQueries({ queryKey: ['worklist'] }),
      ])
    },
  })
  const error = m.error
  const message = error instanceof ApiError && typeof (error.body as { detail?: unknown } | undefined)?.detail === 'string'
    ? (error.body as { detail: string }).detail
    : error?.message
  return { run: m.mutate, pending: m.isPending, saved: m.isSuccess, data: m.data, error: message }
}

function ErrorText({ id, children }: { id?: string; children: React.ReactNode }) {
  return <p id={id} role="alert" className="font-semibold text-level-red">{children}</p>
}

/**
 * "I've seen this." Shows the acknowledgement state for everyone, and the button
 * only to a role that may acknowledge.
 */
export function AcknowledgeAction({ task, canAct, stale, onAcknowledged }: {
  task: Task
  canAct: boolean
  stale: boolean
  onAcknowledged?: () => void
}) {
  const { t } = useTranslation()
  const ack = useAction(task.visit_id, (_: void, submission_id) => acknowledgeTask(task.task_id, { submission_id }), onAcknowledged)
  if (task.status !== 'open') {
    return (
      <p className="font-semibold">
        {t('visitPage.ackDone', { time: clock(task.acknowledged_at ?? task.created_at) })}
        {task.acknowledged_by && <span className="font-normal text-muted"> · {t(`role.${task.acknowledged_by.role}`)}</span>}
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-small font-semibold">{t('visitPage.ackPending')}</p>
      {canAct ? (
        <Button className="w-full" disabled={stale || ack.pending} onClick={() => ack.run()}>
          {ack.pending ? t('actions.saving') : t('actions.acknowledge')}
        </Button>
      ) : (
        <p className="text-small text-muted">{t('visitPage.notRouted', { roles: rolesText(task.routed_to, t) })}</p>
      )}
      <p className="text-small text-muted">{t('actions.ackHelp')}</p>
      {ack.error && <ErrorText>{ack.error}</ErrorText>}
    </div>
  )
}

/**
 * The outcome list, for a role the task is routed to. Nothing is preselected. The button
 * stays enabled and says what is missing: the task must be acknowledged first, and an
 * outcome chosen deliberately.
 */
export function DispositionForm({ task, stale, focusRequest, onComplete }: {
  task: Task
  stale: boolean
  /** Increment to move focus to the first outcome, e.g. right after acknowledging. */
  focusRequest: number
  onComplete: (task: Task) => void
}) {
  const { t } = useTranslation()
  const name = useId()
  const [disposition, setDisposition] = useState<Disposition | ''>('')
  const [problem, setProblem] = useState<'ack' | 'choose' | null>(null)
  const first = useRef<HTMLInputElement>(null)
  const assess = useAction(task.visit_id, (d: Disposition, submission_id) =>
    assessTask(task.task_id, { submission_id, disposition: d }),
    onComplete,
  )
  const acknowledged = task.status === 'acknowledged'
  const locked = stale || assess.pending

  useEffect(() => {
    if (focusRequest > 0) first.current?.focus()
  }, [focusRequest])

  return (
    <SectionCard
      title={t('visitPage.assessment.disposition')}
      lead={disposition
        ? t('visitPage.assessment.statusSelected', { disposition: t(`disposition.${disposition}`) })
        : t('visitPage.assessment.statusPending')}
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (locked) return
          if (!acknowledged) return setProblem('ack')
          if (!disposition) {
            setProblem('choose')
            first.current?.focus()
            return
          }
          setProblem(null)
          assess.run(disposition)
        }}
      >
        <fieldset disabled={locked} aria-describedby={problem === 'choose' ? 'disposition-error' : undefined}>
          <legend className="mb-2 text-small font-semibold">{t('actions.disposition')}</legend>
          <div className={cn('choice-list', problem === 'choose' && 'border-level-red!')}>
            {DISPOSITIONS.map((d, i) => (
              <label key={d}>
                <input
                  ref={i === 0 ? first : undefined}
                  type="radio"
                  name={name}
                  value={d}
                  checked={disposition === d}
                  onChange={() => {
                    setDisposition(d)
                    if (problem === 'choose') setProblem(null)
                  }}
                />
                {t(`disposition.${d}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" className="w-full" disabled={locked}>
          {assess.pending ? t('actions.saving') : t('actions.assess')}
        </Button>
        <p className="text-small text-muted">{t('visitPage.assessment.assessHelp')}</p>
        {problem && (
          <ErrorText id="disposition-error">
            {problem === 'ack' ? t('actions.ackFirst') : t('visitPage.assessment.chooseOutcome')}
          </ErrorText>
        )}
        {assess.error && <ErrorText>{assess.error}</ErrorText>}
      </form>
    </SectionCard>
  )
}

function VitalsInput({ field, value, disabled, error, onChange }: {
  field: VitalsField
  value: string
  disabled: boolean
  error?: string
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    // The label row takes any spare height, so inputs line up when a neighbour's label wraps.
    <div className="grid min-w-0 grid-rows-[1fr_auto_auto]">
      <label htmlFor={`v-${field}`} className="mb-1.5 flex items-end text-small font-semibold">{t(`vitals.${field}`)}</label>
      <input
        id={`v-${field}`}
        inputMode="decimal"
        className={FIELD}
        disabled={disabled}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `v-${field}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p id={`v-${field}-error`} className="mt-1.5 text-small font-semibold text-level-red">{error}</p>}
    </div>
  )
}

const VITALS_ORDER: VitalsField[] = ['sbp', 'dbp', 'hr', 'rr', 'spo2', 'temp_c']

export function VitalsCard({ detail, stale }: { detail: VisitDetail; stale: boolean }) {
  const { t } = useTranslation()
  const { visit } = detail
  const vitals = detail.timeline.filter((e): e is VitalsRecord => 'vitals_id' in e)
  const recent = vitals.slice(-3).reverse()
  const [form, setForm] = useState<VitalsForm>(emptyVitals)
  const [measuredAt, setMeasuredAt] = useState('')
  const [errors, setErrors] = useState<VitalsErrors>({})
  const [future, setFuture] = useState(false)
  const attempt = useRef<Parameters<typeof postVitals>[0] | null>(null)
  const action = useAction(visit.visit_id, postVitals, () => {
    attempt.current = null
    setForm(emptyVitals)
    setMeasuredAt('')
  })
  const set = (k: keyof VitalsForm) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    // An error clears once its field is edited.
    setErrors((e) => {
      const next = { ...e }
      delete next[k as VitalsField]
      delete next.none
      return next
    })
  }
  const disabled = stale || action.pending

  const fieldError = (f: VitalsField): string | undefined => {
    const e = errors[f]
    if (!e) return undefined
    const field = t(`vitals.names.${f}`)
    if (e === 'range') {
      const [lo, hi] = VITALS_RANGES[f]
      return t(f === 'temp_c' ? 'vitals.errors.rangeDecimal' : 'vitals.errors.range', { field, lo, hi })
    }
    return t(`vitals.errors.${e}`, { field: e === 'bpPair' ? field.toLocaleLowerCase() : field })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled) return
    const chosen = measuredAt ? new Date(measuredAt) : null
    const isFuture = !!chosen && chosen.getTime() > Date.now() + 60_000
    setFuture(isFuture)
    const previous = attempt.current
    const at = chosen?.toISOString() ?? previous?.measured_at ?? new Date().toISOString()
    const result = validateVitals(form, visit.visit_id, previous?.submission_id ?? newSubmissionId(), at)
    if (!result.ok || isFuture) {
      const found = result.ok ? {} : result.errors
      setErrors(found)
      // Move to the first field that needs fixing.
      const firstBad = VITALS_ORDER.find((f) => found[f])
      const target = document.getElementById(firstBad ? `v-${firstBad}` : isFuture ? 'v-measured' : 'v-sbp')
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'center' })
      return
    }
    setErrors({})
    const body = previous && JSON.stringify(previous) !== JSON.stringify(result.body)
      ? { ...result.body, submission_id: newSubmissionId(), measured_at: chosen?.toISOString() ?? new Date().toISOString() }
      : result.body
    attempt.current = body
    action.run(body)
  }

  const saved = action.saved && form === emptyVitals ? action.data : undefined

  return (
    <SectionCard title={t('actions.vitals')} lead={t('visitPage.assessment.vitalsLead')}>
      {recent.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-small font-semibold">{t('visitPage.assessment.recentVitals')}</h4>
          <ul className="space-y-1 text-small">
            {recent.map((v) => (
              <li key={v.vitals_id} className="flex flex-wrap gap-x-2">
                <span className="tabular font-semibold">{clock(v.measured_at)}</span>
                <span>{vitalsText(v, t)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {saved && (
        <div role="status" className="flex items-start gap-2.5 rounded-data border border-line border-l-4 border-l-ink bg-surface p-3">
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{t('actions.vitalsSavedAt', { time: clock(saved.measured_at) })}</p>
            <p className="text-small text-muted">{vitalsText(saved, t)}</p>
          </div>
        </div>
      )}
      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset className="min-w-0">
          <legend className="mb-2 font-semibold">{t('visitPage.assessment.bp')}</legend>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-3">
            <VitalsInput field="sbp" value={form.sbp} disabled={disabled} error={fieldError('sbp')} onChange={set('sbp')} />
            <VitalsInput field="dbp" value={form.dbp} disabled={disabled} error={fieldError('dbp')} onChange={set('dbp')} />
          </div>
        </fieldset>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-3">
          <VitalsInput field="hr" value={form.hr} disabled={disabled} error={fieldError('hr')} onChange={set('hr')} />
          <VitalsInput field="rr" value={form.rr} disabled={disabled} error={fieldError('rr')} onChange={set('rr')} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-3">
          <VitalsInput field="spo2" value={form.spo2} disabled={disabled} error={fieldError('spo2')} onChange={set('spo2')} />
          <VitalsInput field="temp_c" value={form.temp_c} disabled={disabled} error={fieldError('temp_c')} onChange={set('temp_c')} />
        </div>
        <div>
          <label htmlFor="v-measured" className="mb-1.5 block text-small font-semibold">{t('visitPage.assessment.measuredAt')}</label>
          <input
            id="v-measured"
            type="datetime-local"
            className={FIELD}
            disabled={disabled}
            value={measuredAt}
            aria-invalid={future ? true : undefined}
            aria-describedby={future ? 'v-measured-error v-measured-help' : 'v-measured-help'}
            onChange={(e) => {
              setMeasuredAt(e.target.value)
              setFuture(false)
            }}
          />
          {future && <p id="v-measured-error" className="mt-1.5 text-small font-semibold text-level-red">{t('vitals.errors.future')}</p>}
          <p id="v-measured-help" className="mt-1.5 text-small text-muted">{t('visitPage.assessment.measuredAtHelp')}</p>
        </div>
        {vitals.length > 0 && (
          <div>
            <label htmlFor="v-supersedes" className="mb-1.5 block text-small font-semibold">{t('vitals.supersedes')}</label>
            <select id="v-supersedes" className={`${FIELD} select`} disabled={disabled} value={form.supersedes} onChange={(e) => set('supersedes')(e.target.value)}>
              <option value="">{t('vitals.newEntry')}</option>
              {vitals.map((v) => (
                <option key={v.vitals_id} value={v.vitals_id}>
                  {clock(v.measured_at)} · {vitalsText(v, t)}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" className="w-full" disabled={disabled}>
          {action.pending ? t('actions.saving') : t('actions.recordVitals')}
        </Button>
        {/* Form-level messages go below the button, so they never push it down. */}
        {errors.none && <ErrorText>{t('vitals.errors.none')}</ErrorText>}
        {action.error && <ErrorText>{action.error}</ErrorText>}
        <p className="text-small text-muted">{t('visitPage.assessment.vitalsNotAssessment')}</p>
      </form>
    </SectionCard>
  )
}

/** Raises a physician review task. Never moves the patient in the queue. */
export function FlagHigherCard({ visit, stale }: { visit: VisitSummary; stale: boolean }) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const flag = useAction(visit.visit_id, (n: string, submission_id) =>
    postFlagHigher({ submission_id, visit_id: visit.visit_id, ...(n ? { note: n } : {}) }),
    () => setNote(''),
  )
  return (
    <SectionCard title={t('actions.flagHigher')} lead={t('visitPage.flagLead')}>
      <div className="space-y-1.5">
        <label htmlFor="flag-note" className="block text-small font-semibold">{t('visitPage.flagNote')}</label>
        <textarea
          id="flag-note"
          rows={2}
          maxLength={NOTE_MAX}
          className={`${FIELD} resize-y py-2.5`}
          placeholder={t('visitPage.flagPlaceholder')}
          aria-describedby="flag-count"
          disabled={stale || flag.pending}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p id="flag-count" className="tabular text-note text-muted">{t('visitPage.flagCount', { count: note.length, max: NOTE_MAX })}</p>
      </div>
      <Button variant="secondary" className="w-full" disabled={stale || flag.pending} onClick={() => flag.run(note.trim())}>
        <Flag aria-hidden className="size-[1.125rem]" />
        {flag.pending ? t('actions.saving') : t('actions.flagHigher')}
      </Button>
      {flag.saved && !note && <p role="status" className="text-small text-muted">{t('actions.flagSaved')}</p>}
      {flag.error && <ErrorText>{flag.error}</ErrorText>}
    </SectionCard>
  )
}

/**
 * The visit's one QR, who is signed in, and signing a device out. The QR is
 * fetched each time it is shown, because the server logs every re-show.
 */
export function VisitQrCard({ visit, stale }: { visit: VisitSummary; stale: boolean }) {
  const { t } = useTranslation()
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const show = useMutation({
    mutationFn: () => getVisitLink(visit.visit_id),
    onSuccess: (v) => {
      setError(null)
      setLink(v.link)
    },
    onError: () => setError(t('actions.showQrFailed')),
  })
  const signOut = useAction(visit.visit_id, (_: void, submission_id) => staffSignOut(visit.visit_id, { submission_id }))
  const available = !visit.app_exclusion && visit.status === 'waiting'

  return (
    <SectionCard title={t('visitPage.manage.qr')} lead={available ? t('visitPage.manage.qrAvailable') : undefined}>
      {available ? (
        <>
          <p>{t('visitPage.manage.qrHelp')}</p>
          <p className="font-semibold">{signedInText(visit, t)}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {/* The label and icon stay put; aria-expanded says whether the QR is showing. */}
            <Button
              variant="secondary"
              aria-expanded={!!link}
              aria-controls="visit-qr"
              disabled={stale || show.isPending}
              onClick={() => (link ? setLink(null) : show.mutate())}
            >
              <ScanLine aria-hidden className="size-[1.125rem]" />
              {t('visitPage.manage.showQr')}
            </Button>
            {link && (
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer aria-hidden className="size-[1.125rem]" />
                {t('enrol.print')}
              </Button>
            )}
            {visit.signed_in_as && (
              <Button variant="secondary" disabled={stale || signOut.pending} onClick={() => signOut.run()}>
                {t('actions.signOutDevice')}
              </Button>
            )}
            <p className="min-w-[min(12rem,100%)] flex-1 text-small text-muted">{t('visitPage.manage.qrReused')}</p>
          </div>
          {/* Flat inside this section: no second card shadow. Printing prints only this. */}
          <div id="visit-qr" className={cn(link && 'print-qr', '[&>div]:bg-transparent! [&>div]:p-2! [&>div]:shadow-none!')}>
            {link && <QrCard title={t('enrol.qrTitle')} hint={t('enrol.qrHint')} link={link} />}
          </div>
          {(error || signOut.error) && <ErrorText>{error ?? signOut.error}</ErrorText>}
        </>
      ) : (
        <p className="text-muted">{t('visitPage.manage.qrUnavailable')}</p>
      )}
    </SectionCard>
  )
}

type ClosedStatus = 'roomed' | 'left' | 'discharged'

/**
 * Roomed, Left or Discharged. Each one ends the visit and signs out the patient's phone
 * (the API closes the visit and revokes its session), so each asks for a confirm first.
 */
export function VisitStatusCard({ visit, stale }: { visit: VisitSummary; stale: boolean }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState<ClosedStatus | null>(null)
  const [done, setDone] = useState<ClosedStatus | null>(null)
  const status = useAction(visit.visit_id, (s: ClosedStatus, submission_id) =>
    updateVisitStatus(visit.visit_id, { submission_id, status: s }),
  )
  const hasPhone = !visit.app_exclusion
  return (
    <SectionCard
      title={t('actions.visitStatus')}
      lead={t('visitPage.manage.currentStatus', { status: t(`visitStatus.${visit.status}`) })}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {(['roomed', 'left', 'discharged'] as const).map((s) => (
          <Button
            key={s}
            variant={s === 'roomed' ? 'primary' : 'secondary'}
            aria-pressed={visit.status === s}
            aria-expanded={confirming === s}
            disabled={stale || status.pending || visit.status === s}
            onClick={() => {
              setDone(null)
              setConfirming(s)
            }}
          >
            {t(`visitStatus.${s}`)}
          </Button>
        ))}
      </div>
      {confirming && (
        <div role="group" aria-labelledby="status-confirm" className="space-y-3 rounded-data border border-line bg-canvas p-4">
          <p id="status-confirm" className="font-semibold">{t('visitPage.manage.confirmTitle', { status: t(`visitStatus.${confirming}`).toLocaleLowerCase() })}</p>
          <p className="text-small">
            {visit.status === 'waiting'
              ? t(hasPhone ? 'visitPage.manage.confirmEnds' : 'visitPage.manage.confirmEndsNoPhone')
              : t('visitPage.manage.confirmChange')}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant={confirming === 'roomed' ? 'primary' : 'danger'}
              disabled={stale || status.pending}
              onClick={() => {
                const s = confirming
                status.run(s, { onSuccess: () => { setConfirming(null); setDone(s) } })
              }}
            >
              {status.pending ? t('actions.saving') : t('visitPage.manage.confirmButton', { status: t(`visitStatus.${confirming}`).toLocaleLowerCase() })}
            </Button>
            <Button variant="secondary" disabled={status.pending} onClick={() => setConfirming(null)}>
              {t('visitPage.manage.cancel')}
            </Button>
          </div>
        </div>
      )}
      {done && visit.closed_at && (
        <p role="status" className="flex items-start gap-2 font-semibold">
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
          {t(hasPhone ? 'visitPage.manage.statusDone' : 'visitPage.manage.statusDoneNoPhone', {
            status: t(`visitStatus.${done}`).toLocaleLowerCase(),
            time: clock(visit.closed_at),
          })}
        </p>
      )}
      <p className="text-small text-muted">{t('visitPage.manage.statusHelp')}</p>
      {status.error && <ErrorText>{status.error}</ErrorText>}
    </SectionCard>
  )
}

/** Irreversible: a reason must be chosen deliberately, then confirmed. The button checks both on press. */
export function StopAppCard({ visit, stale }: { visit: VisitSummary; stale: boolean }) {
  const { t } = useTranslation()
  const name = useId()
  const [reason, setReason] = useState<AppExclusion | ''>('')
  const [confirmed, setConfirmed] = useState(false)
  const [problem, setProblem] = useState<'reason' | 'confirm' | null>(null)
  const exclude = useAction(visit.visit_id, (r: AppExclusion, submission_id) =>
    updateVisitExclusion(visit.visit_id, { submission_id, app_exclusion: r }),
  )

  if (visit.app_exclusion) {
    return (
      <SectionCard title={t('actions.stopApp')}>
        <p>{t('enrol.notOffered', { reason: t(`exclusion.${visit.app_exclusion}`) })}</p>
        <p className="text-small text-muted">{t('enrol.excludedHelp')}</p>
      </SectionCard>
    )
  }

  const locked = stale || exclude.pending
  return (
    <SectionCard title={t('actions.stopApp')} lead={t('visitPage.manage.stopLead')}>
      <Note tone="neutral">
        <p>{t('visitPage.manage.stopImpact')}</p>
        <p className="font-semibold">{t('visitPage.manage.stopContinues')}</p>
        <p className="text-small text-muted">{t('visitPage.manage.stopCannotUndo')}</p>
      </Note>
      <fieldset disabled={locked} aria-describedby={problem === 'reason' ? 'stop-error' : undefined}>
        <legend className="mb-2 text-small font-semibold">{t('visitPage.manage.stepReason')}</legend>
        <div className={cn('choice-list', problem === 'reason' && 'border-level-red!')}>
          {EXCLUSIONS.map((x) => (
            <label key={x}>
              <input
                type="radio"
                name={name}
                value={x}
                checked={reason === x}
                onChange={() => {
                  setReason(x)
                  if (problem === 'reason') setProblem(null)
                }}
              />
              {t(`exclusion.${x}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={locked} aria-describedby={problem === 'confirm' ? 'stop-error' : undefined}>
        <legend className="mb-2 text-small font-semibold">{t('visitPage.manage.stepConfirm')}</legend>
        <label className="flex min-h-12 items-center gap-3 text-small">
          <input
            id="stop-confirm"
            type="checkbox"
            className="size-5 accent-level-red"
            checked={confirmed}
            aria-invalid={problem === 'confirm' ? true : undefined}
            onChange={(e) => {
              setConfirmed(e.target.checked)
              if (problem === 'confirm') setProblem(null)
            }}
          />
          {t('actions.stopAppConfirm')}
        </label>
      </fieldset>
      <Button
        variant="danger"
        className="w-full"
        disabled={locked}
        onClick={() => {
          if (!reason) return setProblem('reason')
          if (!confirmed) {
            setProblem('confirm')
            document.getElementById('stop-confirm')?.focus()
            return
          }
          setProblem(null)
          exclude.run(reason)
        }}
      >
        {exclude.pending ? t('actions.saving') : t('actions.stopAppButton')}
      </Button>
      {problem && <ErrorText id="stop-error">{t(problem === 'reason' ? 'visitPage.manage.chooseReason' : 'visitPage.manage.tickConfirm')}</ErrorText>}
      <p className="text-small text-muted">{t('visitPage.manage.stopHelp')}</p>
      {exclude.error && <ErrorText>{exclude.error}</ErrorText>}
    </SectionCard>
  )
}
