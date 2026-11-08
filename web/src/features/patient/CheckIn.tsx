import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheckBig, Clock, OctagonAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPatientHome } from '@/api/api'
import { options, text } from '@/api/bank'
import { ApiError, newSubmissionId } from '@/api/client'
import type { CheckinReport, ConcernCode, FindingCode, PatientHome, PatientMessage, PatientReport, ReportReceipt } from '@/api/types'
import { AnswerButton } from '@/components/AnswerButton'
import { CountdownChip } from '@/components/CountdownChip'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { sendReport } from '@/lib/outbox'
import { useNow } from '@/lib/time'
import { CheckinFlow } from './CheckinFlow'
import { PatientLayout } from './PatientLayout'

type View =
  | { name: 'home' }
  | { name: 'checkin' }
  | { name: 'change' }
  | { name: 'confirmLeave' }
  | { name: 'followup'; keys: string[] }
  | { name: 'urgent'; queued: boolean; followUps: string[] }
  | { name: 'desk'; queued: boolean }
  | { name: 'sent'; queued: boolean; message: PatientMessage }

const URGENT: PatientMessage[] = ['clinician_will_check', 'clinician_told']

/** /check-in. The patient or companion's whole experience after scanning the QR. */
export function CheckIn() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const now = useNow()
  const { data: home, isPending, error } = useQuery({ queryKey: ['home'], queryFn: getPatientHome, retry: false })
  const [view, setView] = useState<View>({ name: 'home' })
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  if (isPending) return <PatientLayout><p role="status">{t('common.loading')}</p></PatientLayout>
  if (error || !home) {
    const noSession = error instanceof ApiError && error.status === 401
    return (
      <PatientLayout>
        <Card role="alert" className="space-y-2 text-center">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{t(noSession ? 'exchange.noSession.title' : 'exchange.invalid.title')}</h1>
          <p>{t('exchange.askDesk')}</p>
        </Card>
      </PatientLayout>
    )
  }

  const common = (reporter = home.role) => ({
    submission_id: newSubmissionId(),
    reporter,
    channel: 'phone' as const,
    captured_at: new Date().toISOString(),
  })

  /** Send, then route to the screen the receipt calls for. Offline sends are saved, not lost. */
  async function deliver(body: PatientReport, after: (receipt: ReportReceipt | null) => View) {
    setSending(true)
    setFailed(false)
    try {
      const result = await sendReport(body)
      if (!result.queued) await qc.invalidateQueries({ queryKey: ['home'] })
      setView(after(result.queued ? null : result.receipt))
    } catch (e) {
      // A prompt the server no longer accepts (expired or already used): get a fresh one.
      if (e instanceof ApiError && e.status === 409) await qc.invalidateQueries({ queryKey: ['home'] })
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  const afterReport = (receipt: ReportReceipt | null): View => {
    if (!receipt) return { name: 'sent', queued: true, message: 'none' }
    const followUps = receipt.follow_up_items ?? []
    if (URGENT.includes(receipt.patient_message)) return { name: 'urgent', queued: false, followUps }
    if (followUps.length > 0) return { name: 'followup', keys: followUps }
    return { name: 'sent', queued: false, message: receipt.patient_message }
  }

  const concern = (c: ConcernCode) => {
    if (c === 'desk_question') {
      // Non-clinical: it goes to the triage nurse, so it never shows the urgent screen.
      return void deliver({ kind: 'concern', concern: c, ...common() }, (receipt) => ({ name: 'desk', queued: receipt === null }))
    }
    return void deliver({ kind: 'concern', concern: c, ...common() }, (receipt) =>
      // A help request always shows the "tell staff now" screen, even if it could not be sent yet.
      receipt ? { name: 'urgent', queued: false, followUps: receipt.follow_up_items ?? [] } : { name: 'urgent', queued: true, followUps: [] },
    )
  }

  const submitCheckin = (report: CheckinReport) => void deliver(report, afterReport)
  const refreshPrompt = () => void qc.invalidateQueries({ queryKey: ['home'] })

  return (
    <PatientLayout home={home} dock={{ onConcern: concern, onLeaving: () => setView({ name: 'confirmLeave' }), disabled: sending }}>
      {failed && (
        <p role="alert" className="flex items-start gap-2 rounded-card bg-level-red-bg px-5 py-3 font-semibold text-level-red">
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          {t('patient.sendFailed')}
        </p>
      )}

      {view.name === 'home' && <Home home={home} now={now} setView={setView} />}

      {view.name === 'checkin' && (
        <CheckinFlow
          key={`full-${home.attention_prompt?.prompt_id ?? 'none'}`}
          home={home}
          sending={sending}
          onSubmit={submitCheckin}
          onCancel={() => setView({ name: 'home' })}
          onPromptExpired={refreshPrompt}
        />
      )}

      {view.name === 'followup' && (
        <CheckinFlow
          key="followup"
          home={home}
          mode="followup"
          itemKeys={view.keys}
          sending={sending}
          onSubmit={submitCheckin}
          onCancel={() => setView({ name: 'home' })}
          onPromptExpired={refreshPrompt}
        />
      )}

      {view.name === 'change' && (
        <ReportChange
          home={home}
          sending={sending}
          onCancel={() => setView({ name: 'home' })}
          onSend={(findings) => void deliver({ kind: 'finding', findings: findings as [FindingCode, ...FindingCode[]], ...common() }, afterReport)}
        />
      )}

      {view.name === 'confirmLeave' && (
        <Card className="space-y-3">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{t('leaving.title')}</h1>
          <p>{t('leaving.info')}</p>
          <Button
            size="lg"
            variant="danger"
            className="w-full"
            disabled={sending}
            onClick={() =>
              void deliver({ kind: 'leaving', ...common() }, (r) =>
                r ? { name: 'sent', queued: false, message: r.patient_message } : { name: 'sent', queued: true, message: 'leaving_info' },
              )
            }
          >
            {t('leaving.confirm')}
          </Button>
          <Button size="lg" variant="secondary" className="w-full" onClick={() => setView({ name: 'home' })}>
            {t('leaving.cancel')}
          </Button>
        </Card>
      )}

      {view.name === 'urgent' && (
        <Card role="alert" className="space-y-4 text-center ring-2 ring-level-red">
          <span aria-hidden className="mx-auto flex size-16 items-center justify-center rounded-full bg-level-red-bg text-level-red">
            <OctagonAlert className="size-8" />
          </span>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-level-red">{t('urgent.title')}</h1>
          <p className="text-xl">{t('urgent.body')}</p>
          <p className="font-semibold">{view.queued ? t('urgent.queued') : t('urgent.sent')}</p>
          <Button
            size="lg"
            variant="danger"
            className="w-full"
            onClick={() => setView(view.followUps.length > 0 ? { name: 'followup', keys: view.followUps } : { name: 'home' })}
          >
            {t('urgent.telling')}
          </Button>
        </Card>
      )}

      {view.name === 'desk' && (
        <Card className="space-y-3">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{view.queued ? t('sent.queuedTitle') : t('desk.title')}</h1>
          <p>{view.queued ? t('sent.queuedBody') : t('desk.body')}</p>
          <p className="text-base text-muted">{t('desk.notClinical')}</p>
          <Button size="lg" className="w-full" onClick={() => setView({ name: 'home' })}>
            {t('sent.back')}
          </Button>
        </Card>
      )}

      {view.name === 'sent' && (
        <Card className="space-y-3">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{view.queued ? t('sent.queuedTitle') : t('sent.title')}</h1>
          <p>{view.queued ? t('sent.queuedBody') : t(`message.${view.message}`)}</p>
          {/* Never "all clear": staff still check on their own schedule. */}
          <p className="text-base text-muted">{t('sent.stillChecking')}</p>
          {/* Patient-safe timeline only: no task level or reasons ever reach this screen. */}
          <ol className="space-y-2 rounded-2xl bg-canvas p-4 text-base">
            <li className="flex items-center gap-2">
              <CircleCheckBig aria-hidden className="size-5 shrink-0 text-brand-500" />
              {t('sent.reported')}
            </li>
            <li className={view.queued ? 'flex items-center gap-2 text-muted' : 'flex items-center gap-2'}>
              {view.queued ? <Clock aria-hidden className="size-5 shrink-0" /> : <CircleCheckBig aria-hidden className="size-5 shrink-0 text-brand-500" />}
              {view.queued ? t('sent.waiting') : t('sent.received')}
            </li>
          </ol>
          <Button size="lg" className="w-full" onClick={() => setView({ name: 'home' })}>
            {t('sent.back')}
          </Button>
        </Card>
      )}
    </PatientLayout>
  )
}

function Home({ home, now, setView }: { home: PatientHome; now: number; setView: (v: View) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{t(home.role === 'companion' ? 'patient.titleCompanion' : 'patient.title')}</h1>
      {home.message !== 'none' && <p className="rounded-card bg-brand-50 px-5 py-4">{t(`message.${home.message}`)}</p>}
      <Card className="space-y-1">
        <div className="eyebrow">{t('patient.nextCheckin')}</div>
        <div className="text-3xl font-semibold tracking-tight">
          <CountdownChip due={home.next_checkin_due_at} now={now} />
        </div>
      </Card>
      <div className="grid gap-3">
        <Button size="lg" onClick={() => setView({ name: 'checkin' })}>
          {t('patient.startCheckin')}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setView({ name: 'change' })}>
          {t('patient.reportChange')}
        </Button>
      </div>
    </div>
  )
}

/** Report one or more new warning signs outside a scheduled check-in. Options come from the bank. */
function ReportChange({ home, onSend, onCancel, sending }: { home: PatientHome; onSend: (f: FindingCode[]) => void; onCancel: () => void; sending: boolean }) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<FindingCode[]>([])
  return (
    <section aria-labelledby="change" className="space-y-4">
      <h1 id="change" className="text-[1.75rem] font-semibold leading-tight tracking-tight">
        {text('new_findings', home.role)}
      </h1>
      <div className="grid gap-3">
        {options('new_findings').map((o) => {
          const code = o.code as FindingCode
          return (
            <AnswerButton key={code} selected={picked.includes(code)} onClick={() => setPicked(picked.includes(code) ? picked.filter((x) => x !== code) : [...picked, code])}>
              {o.text}
            </AnswerButton>
          )
        })}
      </div>
      <Button size="lg" className="w-full" disabled={picked.length === 0 || sending} onClick={() => onSend(picked)}>
        {t('change.send')}
      </Button>
      <Button size="lg" variant="secondary" className="w-full" onClick={onCancel}>
        {t('flow.back')}
      </Button>
    </section>
  )
}
