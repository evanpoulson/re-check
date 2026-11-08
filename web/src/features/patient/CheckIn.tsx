import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ChevronLeft, CircleAlert, CircleCheckBig, Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPatientHome, signOut } from '@/api/api'
import { options, text } from '@/api/bank'
import { ApiError, newSubmissionId } from '@/api/client'
import type {
  CheckinReport,
  ConcernCode,
  FindingCode,
  PatientHome,
  PatientMessage,
  PatientReport,
  ReportReceipt,
} from '@/api/types'
import { AnswerButton } from '@/components/AnswerButton'
import { CountdownChip } from '@/components/CountdownChip'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { sendReport } from '@/lib/outbox'
import { useNow } from '@/lib/time'
import { CheckinFlow } from './CheckinFlow'
import { PatientLayout } from './PatientLayout'
import { Reminders } from './Reminders'

type View =
  | { name: 'home' }
  | { name: 'checkin' }
  | { name: 'change' }
  | { name: 'confirmLeave' }
  | { name: 'followup'; keys: string[] }
  | { name: 'desk'; queued: boolean }
  | { name: 'sent'; queued: boolean; message: PatientMessage; followUps?: string[] }

const URGENT: PatientMessage[] = ['clinician_will_check', 'clinician_told']

/** /check-in. The patient or companion's whole experience after scanning the QR. */
export function CheckIn() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const now = useNow()
  const { data: home, isPending, error } = useQuery({
    queryKey: ['home'],
    queryFn: getPatientHome,
    retry: false,
    // The poller stores a new department estimate every 5 minutes.
    refetchInterval: 60_000,
  })
  const [view, setView] = useState<View>({ name: 'home' })
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  // The help buttons stay enabled while sending, so a second tap must not send twice.
  const inFlight = useRef(false)
  const content = useRef<HTMLDivElement>(null)
  // The check-in opens at its due time: refetch then, rather than waiting for the minute poll.
  const dueAt = home?.next_checkin_due_at
  const open = home?.checkin_open
  useEffect(() => {
    if (!dueAt || open) return
    const wait = Math.max(0, Date.parse(dueAt) - Date.now()) + 1000
    const id = setTimeout(() => void qc.invalidateQueries({ queryKey: ['home'] }), wait)
    return () => clearTimeout(id)
  }, [dueAt, open, qc])
  useEffect(() => {
    const heading = content.current?.querySelector('h1')
    if (heading) {
      heading.tabIndex = -1
      heading.focus()
      document.title = `${heading.textContent} · Recheck`
    }
  }, [view.name])

  if (isPending)
    return (
      <PatientLayout>
        <p role="status">{t('common.loading')}</p>
      </PatientLayout>
    )
  if (!home || (error instanceof ApiError && error.status === 401)) {
    // Signed out by takeover, by staff, by the person, or because the visit closed.
    // A signed-out device can't send anything, so it says to tell staff.
    const signedOut = error instanceof ApiError && error.status === 401
    return (
      <PatientLayout>
        <Card role="alert" className="space-y-3 p-5">
          <h1>
            {t(signedOut ? 'exchange.signedOut.title' : 'exchange.invalid.title')}
          </h1>
          <p className="text-muted">{t(signedOut ? 'exchange.signedOut.help' : 'exchange.askDesk')}</p>
        </Card>
      </PatientLayout>
    )
  }

  // Companion wording ("Is the patient leaving?") falls back to the patient's where there is none.
  const companion = home.role === 'companion' ? 'companion' : undefined
  const common = (reporter = home.role) => ({
    submission_id: newSubmissionId(),
    reporter,
    channel: 'phone' as const,
    captured_at: new Date().toISOString(),
  })

  /** Send, then route to the screen the receipt calls for. Offline sends are saved, not lost. */
  async function deliver(body: PatientReport, after: (receipt: ReportReceipt | null) => View) {
    if (inFlight.current) return
    inFlight.current = true
    setSending(true)
    setFailed(false)
    try {
      const result = await sendReport(body)
      setView(after(result.queued ? null : result.receipt))
      if (!result.queued) void qc.invalidateQueries({ queryKey: ['home'] })
    } catch (e) {
      // A prompt the server no longer accepts (expired or already used): get a fresh one.
      // Signed out (401): refetching shows the signed-out screen.
      if (e instanceof ApiError && (e.status === 409 || e.status === 401)) await qc.invalidateQueries({ queryKey: ['home'] })
      setFailed(true)
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  const afterReport = (receipt: ReportReceipt | null): View => {
    if (!receipt) return { name: 'sent', queued: true, message: 'none' }
    const followUps = receipt.follow_up_items ?? []
    // An urgent report confirms first; its follow-ups stay optional.
    if (URGENT.includes(receipt.patient_message)) return { name: 'sent', queued: false, message: receipt.patient_message, followUps }
    if (followUps.length > 0) return { name: 'followup', keys: followUps }
    return { name: 'sent', queued: false, message: receipt.patient_message }
  }

  const concern = (c: ConcernCode) => {
    const body = { kind: 'concern', concern: c, ...common() } as const
    if (c === 'desk_question') {
      return void deliver(body, (receipt) => ({ name: 'desk', queued: receipt === null }))
    }
    void deliver(body, afterReport)
  }

  const submitCheckin = (report: CheckinReport) => void deliver(report, afterReport)
  const endSession = async (submission_id: string) => {
    await signOut({ submission_id })
    await qc.invalidateQueries({ queryKey: ['home'] })
  }
  const refreshPrompt = () => void qc.invalidateQueries({ queryKey: ['home'] })

  return (
    <PatientLayout
      home={home}
      dock={{ onConcern: concern, onLeaving: () => setView({ name: 'confirmLeave' }), disabled: sending }}
      context={view.name === 'home'}
    >
      <div ref={content} className="space-y-6">
        {failed && (
          <p role="alert" className="flex items-start gap-3 rounded-card bg-level-red-bg px-5 py-4 text-base font-medium text-level-red">
            <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
            {t('patient.sendFailed')}
          </p>
        )}

        {view.name === 'home' && <Home home={home} now={now} setView={setView} onSignOut={endSession} />}
        {view.name === 'home' && <Reminders />}

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
            onSend={(findings) =>
              void deliver({ kind: 'finding', findings: findings as [FindingCode, ...FindingCode[]], ...common() }, afterReport)
            }
          />
        )}

        {view.name === 'confirmLeave' && (
          <section className="space-y-6">
            <div className="space-y-2">
              <h1>{t('leaving.title', { context: companion })}</h1>
              <p>{t('leaving.info', { context: companion })}</p>
            </div>
            <div className="grid gap-3">
              <Button
                size="lg"
                className="w-full"
                disabled={sending}
                onClick={() =>
                  void deliver({ kind: 'leaving', ...common() }, (r) =>
                    r
                      ? { name: 'sent', queued: false, message: r.patient_message }
                      : { name: 'sent', queued: true, message: 'leaving_info' },
                  )
                }
              >
                {t('leaving.confirm', { context: companion })}
              </Button>
              <Button size="lg" variant="secondary" className="w-full" onClick={() => setView({ name: 'home' })}>
                {t('leaving.cancel', { context: companion })}
              </Button>
            </div>
          </section>
        )}

        {view.name === 'desk' && (
          <section className="space-y-6">
            <div className="space-y-2">
              <h1>{view.queued ? t('sent.queuedTitle') : t('desk.title')}</h1>
              <p>{view.queued ? t('sent.queuedBody') : t('desk.body')}</p>
              <p className="text-base text-muted">{t('desk.notClinical')}</p>
            </div>
            <Button size="lg" className="w-full" onClick={() => setView({ name: 'home' })}>
              {t('sent.back')}
            </Button>
          </section>
        )}

        {view.name === 'sent' && (
          <section className="space-y-6">
            <div className="space-y-2">
              <h1>{view.queued ? t('sent.queuedTitle') : t('sent.title')}</h1>
              <p>{view.queued ? t('sent.queuedBody') : t(`message.${view.message}`, { context: companion })}</p>
            {/* Leaving: after-leaving advice even when the report has not sent yet. */}
            {view.queued && view.message === 'leaving_info' && <p>{t('leaving.after', { context: companion })}</p>}
            {/* Never "all clear": staff still check on their own schedule. */}
              <p className="text-base text-muted">{t('sent.stillChecking')}</p>
            </div>
            {/* Patient-safe timeline only: no task level or reasons ever reach this screen. */}
            <ol className="p-card space-y-3 text-base">
              <li className="flex items-center gap-2">
                <CircleCheckBig aria-hidden className="size-5 shrink-0 text-brand-500" />
                {t('sent.reported')}
              </li>
              <li className={view.queued ? 'flex items-center gap-2 text-muted' : 'flex items-center gap-2'}>
                {view.queued ? <Clock aria-hidden className="size-5 shrink-0" /> : <CircleCheckBig aria-hidden className="size-5 shrink-0 text-brand-500" />}
                {view.queued ? t('sent.waiting') : t('sent.received')}
              </li>
            </ol>
            <div className="grid gap-3">
              <Button size="lg" className="w-full" onClick={() => setView({ name: 'home' })}>
                {t('sent.back')}
              </Button>
              {view.followUps && view.followUps.length > 0 && (
                <Button size="lg" variant="ghost" className="w-full" onClick={() => setView({ name: 'followup', keys: view.followUps! })}>
                  {t('sent.followup', { count: view.followUps.length })}
                </Button>
              )}
            </div>
          </section>
        )}
      </div>
    </PatientLayout>
  )
}

function Home({ home, now, setView, onSignOut }: { home: PatientHome; now: number; setView: (v: View) => void; onSignOut: (submissionId: string) => Promise<void> }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div>
        <h1>{t(home.role === 'companion' ? 'patient.titleCompanion' : 'patient.title')}</h1>
        {home.role === 'companion' && <p className="p-lede">{t('patient.companionHint')}</p>}
      </div>
      {home.message !== 'none' && <p className="rounded-card bg-brand-50 px-5 py-4 text-base">{t(`message.${home.message}`)}</p>}
      <section className="p-card" aria-label={t('patient.nextCheckin')}>
        {home.checkin_open ? (
          <Button size="lg" className="w-full justify-between" onClick={() => setView({ name: 'checkin' })}>
            {t('patient.startCheckin')}
            <ArrowRight size={20} aria-hidden className="rtl:-scale-x-100" />
          </Button>
        ) : (
          // Not due yet: say when it opens. Help and "Report a change" stay available.
          <p className="text-base">{t('patient.checkinNotOpen')}</p>
        )}
        <div className="patient-next">
          <span>{t('patient.nextCheckin')}</span>
          <CountdownChip due={home.next_checkin_due_at} now={now} patient />
        </div>
      </section>
      <div className="grid gap-2">
        <Button size="lg" variant="secondary" className="w-full" onClick={() => setView({ name: 'change' })}>
          {t('patient.reportChange')}
        </Button>
        <SignOutButton onSignOut={onSignOut} />
      </div>
    </div>
  )
}

/** Signing out asks first: after it, this device can't send anything until someone scans again. */
function SignOutButton({ onSignOut }: { onSignOut: (submissionId: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const submission = useRef(newSubmissionId())
  async function confirmSignOut() {
    setPending(true)
    setFailed(false)
    try {
      await onSignOut(submission.current)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }
  if (!confirm) {
    return (
      <Button variant="ghost" className="w-full text-base text-muted" onClick={() => setConfirm(true)}>
        {t('patient.signOut')}
      </Button>
    )
  }
  return (
    <Card className="space-y-4 p-5">
      <p>{t('patient.signOutHelp')}</p>
      {failed && <p role="alert">{t('patient.signOutFailed')}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button disabled={pending} onClick={() => void confirmSignOut()}>{t('patient.signOutConfirm')}</Button>
        <Button disabled={pending} variant="secondary" onClick={() => setConfirm(false)}>
          {t('exchange.takeover.cancel')}
        </Button>
      </div>
    </Card>
  )
}

/** Report one or more new warning signs outside a scheduled check-in. Options come from the bank. */
function ReportChange({
  home,
  onSend,
  onCancel,
  sending,
}: {
  home: PatientHome
  onSend: (f: FindingCode[]) => void
  onCancel: () => void
  sending: boolean
}) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<FindingCode[]>([])
  return (
    <section aria-labelledby="change" className="space-y-6">
      <div>
        <button type="button" className="back-link mb-0!" disabled={sending} onClick={onCancel}>
          <ChevronLeft aria-hidden size={18} className="rtl:rotate-180" />
          {t('flow.back')}
        </button>
        <h1 id="change">
          {text('new_findings', home.role)}
        </h1>
      </div>
      <div role="group" aria-labelledby="change" className="grid gap-3">
        {options('new_findings').map((o) => {
          const code = o.code as FindingCode
          return (
            <AnswerButton
              key={code}
              kind="checkbox"
              selected={picked.includes(code)}
              onClick={() => setPicked(picked.includes(code) ? picked.filter((x) => x !== code) : [...picked, code])}
            >
              {o.text}
            </AnswerButton>
          )
        })}
      </div>
      <div className="grid gap-3">
        <Button size="lg" className="w-full" disabled={picked.length === 0 || sending} onClick={() => onSend(picked)}>
          {t('change.send')}
        </Button>
      </div>
    </section>
  )
}
