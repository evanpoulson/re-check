import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Flag, ScanLine } from 'lucide-react'
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
import { emptyVitals, validateVitals, type VitalsError, type VitalsForm } from '@/lib/vitals'
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
function useAction<A>(
  visitId: string,
  fn: (args: A, submissionId: string) => Promise<unknown>,
  onSaved?: () => void,
) {
  const qc = useQueryClient()
  const last = useRef<{ key: string | undefined; id: string } | null>(null)
  const m = useMutation({
    mutationFn: (args: A) => {
      const key = JSON.stringify(args)
      if (!last.current || last.current.key !== key) last.current = { key, id: newSubmissionId() }
      return fn(args, last.current.id)
    },
    onSuccess: async () => {
      last.current = null
      onSaved?.()
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
  return { run: m.mutate, pending: m.isPending, saved: m.isSuccess, error: message }
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="font-semibold text-level-red">{children}</p>
}

/**
 * "I've seen this." Shows the acknowledgement state for everyone, and the button
 * only to a role the task is routed to.
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
      <p className="eyebrow text-ink">{t('visitPage.ackPending')}</p>
      {canAct ? (
        <Button className="w-full" disabled={stale || ack.pending} onClick={() => ack.run()}>
          {ack.pending ? t('actions.saving') : t('actions.acknowledge')}
        </Button>
      ) : (
        <p className="text-[0.9375rem] text-muted">
          {t('visitPage.notRouted', { roles: task.routed_to.map((r) => t(`role.${r}`)).join(', ') })}
        </p>
      )}
      <p className="text-[0.9375rem] text-muted">{t('actions.ackHelp')}</p>
      {ack.error && <ErrorText>{ack.error}</ErrorText>}
    </div>
  )
}

/** The disposition list. Nothing is preselected, and it only saves once the task is acknowledged. */
export function DispositionForm({ task, canAct, stale, focusRequest, onComplete }: {
  task: Task
  canAct: boolean
  stale: boolean
  /** Increment to move focus to the first outcome, e.g. right after acknowledging. */
  focusRequest: number
  onComplete: () => void
}) {
  const { t } = useTranslation()
  const name = useId()
  const [disposition, setDisposition] = useState<Disposition | ''>('')
  const first = useRef<HTMLInputElement>(null)
  const assess = useAction(task.visit_id, (d: Disposition, submission_id) =>
    assessTask(task.task_id, { submission_id, disposition: d }),
    onComplete,
  )
  const acknowledged = task.status === 'acknowledged'
  const locked = !canAct || stale || assess.pending

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
        onSubmit={(event) => {
          event.preventDefault()
          if (disposition && acknowledged && !locked) assess.run(disposition)
        }}
      >
        <fieldset disabled={locked}>
          <legend className="mb-2 text-[0.9375rem] font-semibold">{t('actions.disposition')}</legend>
          <div className="choice-list">
            {DISPOSITIONS.map((d, i) => (
              <label key={d}>
                <input
                  ref={i === 0 ? first : undefined}
                  type="radio"
                  name={name}
                  value={d}
                  checked={disposition === d}
                  onChange={() => setDisposition(d)}
                />
                {t(`disposition.${d}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" className="w-full" disabled={locked || !acknowledged || !disposition}>
          {assess.pending ? t('actions.saving') : t('actions.assess')}
        </Button>
        <p className="text-[0.9375rem] text-muted">
          {canAct ? t('visitPage.assessment.assessHelp') : t('visitPage.notRouted', {
            roles: task.routed_to.map((r) => t(`role.${r}`)).join(', '),
          })}
        </p>
        {assess.error && <ErrorText>{assess.error}</ErrorText>}
      </form>
    </SectionCard>
  )
}

function VitalsInput({ field, value, disabled, onChange }: {
  field: keyof Omit<VitalsForm, 'supersedes'>
  value: string
  disabled: boolean
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0">
      <label htmlFor={`v-${field}`} className="mb-1.5 block text-[0.9375rem] font-semibold">{t(`vitals.${field}`)}</label>
      <input id={`v-${field}`} inputMode="decimal" className={FIELD} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function VitalsCard({ detail, stale }: { detail: VisitDetail; stale: boolean }) {
  const { t } = useTranslation()
  const { visit } = detail
  const vitals = detail.timeline.filter((e): e is VitalsRecord => 'vitals_id' in e)
  const [form, setForm] = useState<VitalsForm>(emptyVitals)
  const [measuredAt, setMeasuredAt] = useState('')
  const [vitalsError, setVitalsError] = useState<VitalsError | 'future' | null>(null)
  const attempt = useRef<Parameters<typeof postVitals>[0] | null>(null)
  const action = useAction(visit.visit_id, postVitals, () => {
    attempt.current = null
    setForm(emptyVitals)
    setMeasuredAt('')
  })
  const set = (k: keyof VitalsForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const disabled = stale || action.pending

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled) return
    const chosen = measuredAt ? new Date(measuredAt) : null
    if (chosen && chosen.getTime() > Date.now() + 60_000) return setVitalsError('future')
    const previous = attempt.current
    const at = chosen?.toISOString() ?? previous?.measured_at ?? new Date().toISOString()
    const result = validateVitals(form, visit.visit_id, previous?.submission_id ?? newSubmissionId(), at)
    if (!result.ok) return setVitalsError(result.error)
    setVitalsError(null)
    const body = previous && JSON.stringify(previous) !== JSON.stringify(result.body)
      ? { ...result.body, submission_id: newSubmissionId(), measured_at: chosen?.toISOString() ?? new Date().toISOString() }
      : result.body
    attempt.current = body
    action.run(body)
  }

  return (
    <SectionCard title={t('actions.vitals')} lead={t('visitPage.assessment.vitalsLead')}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset className="min-w-0">
          <legend className="mb-2 font-semibold">{t('visitPage.assessment.bp')}</legend>
          <div className="grid grid-cols-2 gap-3">
            <VitalsInput field="sbp" value={form.sbp} disabled={disabled} onChange={set('sbp')} />
            <VitalsInput field="dbp" value={form.dbp} disabled={disabled} onChange={set('dbp')} />
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <VitalsInput field="hr" value={form.hr} disabled={disabled} onChange={set('hr')} />
          <VitalsInput field="rr" value={form.rr} disabled={disabled} onChange={set('rr')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <VitalsInput field="spo2" value={form.spo2} disabled={disabled} onChange={set('spo2')} />
          <VitalsInput field="temp_c" value={form.temp_c} disabled={disabled} onChange={set('temp_c')} />
        </div>
        <div>
          <label htmlFor="v-measured" className="mb-1.5 block text-[0.9375rem] font-semibold">{t('visitPage.assessment.measuredAt')}</label>
          <input
            id="v-measured"
            type="datetime-local"
            className={FIELD}
            disabled={disabled}
            value={measuredAt}
            aria-describedby="v-measured-help"
            onChange={(e) => setMeasuredAt(e.target.value)}
          />
          <p id="v-measured-help" className="mt-1.5 text-sm text-muted">{t('visitPage.assessment.measuredAtHelp')}</p>
        </div>
        {vitals.length > 0 && (
          <div>
            <label htmlFor="v-supersedes" className="mb-1.5 block text-[0.9375rem] font-semibold">{t('vitals.supersedes')}</label>
            <select id="v-supersedes" className={FIELD} disabled={disabled} value={form.supersedes} onChange={(e) => set('supersedes')(e.target.value)}>
              <option value="">{t('vitals.newEntry')}</option>
              {vitals.map((v) => (
                <option key={v.vitals_id} value={v.vitals_id}>
                  {clock(v.measured_at)}
                  {v.sbp !== null ? ` BP ${v.sbp}/${v.dbp}` : ''}
                  {v.hr !== null ? ` HR ${v.hr}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {vitalsError && <ErrorText>{t(`vitals.errors.${vitalsError}`)}</ErrorText>}
        {action.error && <ErrorText>{action.error}</ErrorText>}
        {action.saved && form === emptyVitals && <p role="status" className="text-sm text-muted">{t('actions.vitalsSaved')}</p>}
        <Button type="submit" className="w-full" disabled={disabled}>
          {action.pending ? t('actions.saving') : t('actions.recordVitals')}
        </Button>
        <p className="text-sm text-muted">{t('visitPage.assessment.vitalsNotAssessment')}</p>
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
        <label htmlFor="flag-note" className="block text-[0.9375rem] font-semibold">{t('visitPage.flagNote')}</label>
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
        <p id="flag-count" className="tabular text-sm text-muted">{t('visitPage.flagCount', { count: note.length, max: NOTE_MAX })}</p>
      </div>
      <Button variant="secondary" className="w-full" disabled={stale || flag.pending} onClick={() => flag.run(note.trim())}>
        <Flag aria-hidden size={18} />
        {flag.pending ? t('actions.saving') : t('actions.flagHigher')}
      </Button>
      {flag.saved && !note && <p role="status" className="text-sm text-muted">{t('actions.flagSaved')}</p>}
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
            {link ? (
              <Button variant="secondary" onClick={() => setLink(null)}>{t('actions.hideQr')}</Button>
            ) : (
              <Button variant="secondary" disabled={stale || show.isPending} onClick={() => show.mutate()}>
                <ScanLine aria-hidden size={18} />
                {t('visitPage.manage.showQr')}
              </Button>
            )}
            {visit.signed_in_as && (
              <Button variant="secondary" disabled={stale || signOut.pending} onClick={() => signOut.run()}>
                {t('actions.signOutDevice')}
              </Button>
            )}
            <p className="min-w-48 flex-1 text-[0.9375rem] text-muted">{t('visitPage.manage.qrReused')}</p>
          </div>
          {link && <QrCard title={t('enrol.qrTitle')} hint={t('enrol.qrHint')} link={link} />}
          {(error || signOut.error) && <ErrorText>{error ?? signOut.error}</ErrorText>}
        </>
      ) : (
        <p className="text-muted">{t('visitPage.manage.qrUnavailable')}</p>
      )}
    </SectionCard>
  )
}

export function VisitStatusCard({ visit, stale }: { visit: VisitSummary; stale: boolean }) {
  const { t } = useTranslation()
  const status = useAction(visit.visit_id, (s: 'roomed' | 'left' | 'discharged', submission_id) =>
    updateVisitStatus(visit.visit_id, { submission_id, status: s }),
  )
  return (
    <SectionCard
      title={t('actions.visitStatus')}
      lead={t('visitPage.manage.currentStatus', { status: t(`visitStatus.${visit.status}`) })}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {(['roomed', 'left', 'discharged'] as const).map((s) => (
          <Button
            key={s}
            variant="secondary"
            aria-pressed={visit.status === s}
            disabled={stale || status.pending || visit.status === s}
            onClick={() => status.run(s)}
          >
            {t(`visitStatus.${s}`)}
          </Button>
        ))}
      </div>
      <p className="text-[0.9375rem] text-muted">{t('visitPage.manage.statusHelp')}</p>
      {status.error && <ErrorText>{status.error}</ErrorText>}
    </SectionCard>
  )
}

/** Irreversible: a reason must be chosen deliberately, then confirmed. */
export function StopAppCard({ visit, stale }: { visit: VisitSummary; stale: boolean }) {
  const { t } = useTranslation()
  const name = useId()
  const [reason, setReason] = useState<AppExclusion | ''>('')
  const [confirmed, setConfirmed] = useState(false)
  const exclude = useAction(visit.visit_id, (r: AppExclusion, submission_id) =>
    updateVisitExclusion(visit.visit_id, { submission_id, app_exclusion: r }),
  )

  if (visit.app_exclusion) {
    return (
      <SectionCard title={t('actions.stopApp')}>
        <p>{t('enrol.notOffered', { reason: t(`exclusion.${visit.app_exclusion}`) })}</p>
        <p className="text-[0.9375rem] text-muted">{t('enrol.excludedHelp')}</p>
      </SectionCard>
    )
  }

  const locked = stale || exclude.pending
  return (
    <SectionCard title={t('actions.stopApp')} lead={t('visitPage.manage.stopLead')}>
      <Note tone="neutral">
        <p>{t('visitPage.manage.stopImpact')}</p>
        <p className="font-semibold">{t('visitPage.manage.stopContinues')}</p>
        <p className="text-[0.9375rem] text-muted">{t('visitPage.manage.stopCannotUndo')}</p>
      </Note>
      <fieldset disabled={locked}>
        <legend className="mb-2 text-[0.9375rem] font-semibold">{t('visitPage.manage.stepReason')}</legend>
        <div className="choice-list">
          {EXCLUSIONS.map((x) => (
            <label key={x}>
              <input type="radio" name={name} value={x} checked={reason === x} onChange={() => setReason(x)} />
              {t(`exclusion.${x}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={locked || !reason}>
        <legend className="mb-2 text-[0.9375rem] font-semibold">{t('visitPage.manage.stepConfirm')}</legend>
        <label className="flex min-h-12 items-center gap-3 text-[0.9375rem]">
          <input
            type="checkbox"
            className="size-5 accent-level-red"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {t('actions.stopAppConfirm')}
        </label>
      </fieldset>
      <Button variant="danger" className="w-full" disabled={locked || !reason || !confirmed} onClick={() => reason && exclude.run(reason)}>
        {exclude.pending ? t('actions.saving') : t('actions.stopAppButton')}
      </Button>
      <p className="text-sm text-muted">{t('visitPage.manage.stopHelp')}</p>
      {exclude.error && <ErrorText>{exclude.error}</ErrorText>}
    </SectionCard>
  )
}
