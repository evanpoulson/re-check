import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { acknowledgeTask, assessTask, postFlagHigher, postVitals, updateVisitExclusion, updateVisitStatus } from '@/api/api'
import { ApiError, newSubmissionId } from '@/api/client'
import type { AppExclusion, Disposition, VisitDetail, VitalsRecord } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { emptyVitals, validateVitals, type VitalsError, type VitalsForm } from '@/lib/vitals'

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

/** Runs one staff action with a submission id created up front and reused on retry. */
function useAction<A>(visitId: string, fn: (args: A, submissionId: string) => Promise<unknown>) {
  const qc = useQueryClient()
  const id = useRef(newSubmissionId())
  const [error, setError] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: (args: A) => fn(args, id.current),
    onSuccess: async () => {
      id.current = newSubmissionId()
      setError(null)
      await Promise.all([qc.invalidateQueries({ queryKey: ['visit', visitId] }), qc.invalidateQueries({ queryKey: ['board'] })])
    },
    onError: (e) => setError(e instanceof ApiError ? ((e.body as { detail?: string } | undefined)?.detail ?? e.message) : String(e)),
  })
  return { run: m.mutate, pending: m.isPending, error }
}

export function VisitActions({ detail }: { detail: VisitDetail }) {
  const { t } = useTranslation()
  const { visit, open_task: task } = detail
  const vitals = detail.timeline.filter((e): e is VitalsRecord => 'vitals_id' in e)
  const [disposition, setDisposition] = useState<Disposition>('assessed_stable')
  const [note, setNote] = useState('')
  const [form, setForm] = useState<VitalsForm>(emptyVitals)
  const [vitalsError, setVitalsError] = useState<VitalsError | null>(null)

  const ack = useAction(visit.visit_id, (_: void, submission_id) => acknowledgeTask(task!.task_id, { submission_id }))
  const assess = useAction(visit.visit_id, (d: Disposition, submission_id) => assessTask(task!.task_id, { submission_id, disposition: d }))
  const flag = useAction(visit.visit_id, (n: string, submission_id) =>
    postFlagHigher({ submission_id, visit_id: visit.visit_id, ...(n.trim() ? { note: n.trim() } : {}) }),
  )
  const status = useAction(visit.visit_id, (s: 'roomed' | 'left' | 'discharged', submission_id) =>
    updateVisitStatus(visit.visit_id, { submission_id, status: s }),
  )
  const [exclusion, setExclusion] = useState<AppExclusion>('child')
  const [confirmExclusion, setConfirmExclusion] = useState(false)
  const exclude = useAction(visit.visit_id, (reason: AppExclusion, submission_id) =>
    updateVisitExclusion(visit.visit_id, { submission_id, app_exclusion: reason }),
  )
  const vitalsAction = useAction(visit.visit_id, (body: Parameters<typeof postVitals>[0]) => postVitals(body))
  const vitalsId = useRef(newSubmissionId())

  const set = (k: keyof VitalsForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function submitVitals(e: React.FormEvent) {
    e.preventDefault()
    const r = validateVitals(form, visit.visit_id, vitalsId.current, new Date().toISOString())
    if (!r.ok) return setVitalsError(r.error)
    setVitalsError(null)
    vitalsAction.run(r.body)
    vitalsId.current = newSubmissionId()
    setForm(emptyVitals)
  }

  const canAck = task?.status === 'open'
  const canAssess = task?.status === 'acknowledged'

  return (
    <section aria-labelledby="actions" className="space-y-4">
      <h2 id="actions" className="text-2xl font-semibold tracking-tight">{t('actions.title')}</h2>

      <Card className="space-y-3">
        <h3 className="text-lg font-semibold tracking-tight">{t('actions.task')}</h3>
        {!task && <p className="text-muted">{t('actions.noTask')}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!canAck || ack.pending} onClick={() => ack.run()}>{t('actions.acknowledge')}</Button>
          <span className="text-sm text-muted">{t('actions.ackHelp')}</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="disposition" className="mb-1.5 block text-sm font-semibold">{t('actions.disposition')}</label>
            <select id="disposition" className={FIELD} value={disposition} onChange={(e) => setDisposition(e.target.value as Disposition)}>
              {DISPOSITIONS.map((d) => (
                <option key={d} value={d}>{t(`disposition.${d}`)}</option>
              ))}
            </select>
          </div>
          <Button disabled={!canAssess || assess.pending} onClick={() => assess.run(disposition)}>{t('actions.assess')}</Button>
        </div>
        {task && !canAssess && task.status === 'open' && <p className="text-sm text-muted">{t('actions.ackFirst')}</p>}
        {(ack.error || assess.error) && <p role="alert" className="font-semibold text-level-red">{ack.error ?? assess.error}</p>}
      </Card>

      <Card>
        <form onSubmit={submitVitals} noValidate className="space-y-3">
          <h3 className="text-lg font-semibold tracking-tight">{t('actions.vitals')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(['sbp', 'dbp', 'hr', 'rr', 'spo2', 'temp_c'] as const).map((k) => (
              <div key={k}>
                <label htmlFor={`v-${k}`} className="mb-1.5 block text-sm font-semibold">{t(`vitals.${k}`)}</label>
                <input id={`v-${k}`} inputMode="decimal" className={FIELD} value={form[k]} onChange={(e) => set(k, e.target.value)} />
              </div>
            ))}
          </div>
          {vitals.length > 0 && (
            <div>
              <label htmlFor="v-supersedes" className="mb-1.5 block text-sm font-semibold">{t('vitals.supersedes')}</label>
              <select id="v-supersedes" className={FIELD} value={form.supersedes} onChange={(e) => set('supersedes', e.target.value)}>
                <option value="">{t('vitals.newEntry')}</option>
                {vitals.map((v) => (
                  <option key={v.vitals_id} value={v.vitals_id}>
                    {new Date(v.measured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {v.sbp !== null ? ` BP ${v.sbp}/${v.dbp}` : ''}
                    {v.hr !== null ? ` HR ${v.hr}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {vitalsError && <p role="alert" className="font-semibold text-level-red">{t(`vitals.errors.${vitalsError}`)}</p>}
          {vitalsAction.error && <p role="alert" className="font-semibold text-level-red">{vitalsAction.error}</p>}
          <Button type="submit" disabled={vitalsAction.pending}>{t('actions.recordVitals')}</Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-lg font-semibold tracking-tight">{t('actions.flagHigher')}</h3>
        <p className="text-sm text-muted">{t('actions.flagHelp')}</p>
        <label htmlFor="flag-note" className="block text-sm font-semibold">{t('actions.flagNote')}</label>
        <input id="flag-note" maxLength={280} className={FIELD} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button
          variant="secondary"
          disabled={flag.pending}
          onClick={() => {
            flag.run(note)
            setNote('')
          }}
        >
          {t('actions.flagHigher')}
        </Button>
        {flag.error && <p role="alert" className="font-semibold text-level-red">{flag.error}</p>}
      </Card>

      {!visit.app_exclusion && (
        <Card className="space-y-3">
          <h3 className="text-lg font-semibold tracking-tight">{t('actions.stopApp')}</h3>
          <p className="text-sm text-muted">{t('actions.stopAppHelp')}</p>
          <label htmlFor="exclusion-reason" className="block text-sm font-semibold">{t('actions.stopAppReason')}</label>
          <select id="exclusion-reason" className={FIELD} value={exclusion} onChange={(e) => setExclusion(e.target.value as AppExclusion)}>
            {EXCLUSIONS.map((x) => (
              <option key={x} value={x}>{t(`exclusion.${x}`)}</option>
            ))}
          </select>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-level-red" checked={confirmExclusion} onChange={(e) => setConfirmExclusion(e.target.checked)} />
            {t('actions.stopAppConfirm')}
          </label>
          <Button variant="danger" disabled={!confirmExclusion || exclude.pending} onClick={() => exclude.run(exclusion)}>
            {t('actions.stopAppButton')}
          </Button>
          {exclude.error && <p role="alert" className="font-semibold text-level-red">{exclude.error}</p>}
        </Card>
      )}

      <Card className="space-y-3">
        <h3 className="text-lg font-semibold tracking-tight">{t('actions.visitStatus')}</h3>
        <div className="flex flex-wrap gap-2">
          {(['roomed', 'left', 'discharged'] as const).map((s) => (
            <Button key={s} variant="secondary" disabled={status.pending} onClick={() => status.run(s)}>
              {t(`visitStatus.${s}`)}
            </Button>
          ))}
        </div>
        {status.error && <p role="alert" className="font-semibold text-level-red">{status.error}</p>}
      </Card>
    </section>
  )
}
