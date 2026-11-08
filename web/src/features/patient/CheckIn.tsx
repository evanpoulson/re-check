import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ChevronLeft, CircleAlert, CircleCheckBig, Clock, CloudOff, QrCode } from 'lucide-react'
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

type View =
  | { name: 'home' }
  | { name: 'checkin' }
  | { name: 'change' }
  | { name: 'confirmLeave' }
  | { name: 'confirmDesk' }
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
  // While the circle check plays, the dock shows only "I need help now".
  const [circlePlaying, setCirclePlaying] = useState(false)
  // The help buttons stay enabled while sending, so a second tap must not send twice.
  const inFlight = useRef(false)
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const heading = content.current?.querySelector('h1')
    if (heading) {
      heading.tabIndex = -1
      // Each new screen starts at the top, wherever the last one was scrolled,
      // so a confirmation is never half under the sticky header.
      document.documentElement.scrollTop = 0
      heading.focus({ preventScroll: true })
      document.title = `${heading.textContent} · Recheck`
    }
    // isPending: also on first load, once the page has its heading.
  }, [view.name, isPending])

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
        <Card role="alert" className="space-y-3">
          <h1 className="text-heading font-semibold leading-tight tracking-tight">
            {t(signedOut ? 'exchange.signedOut.title' : 'exchange.invalid.title')}
          </h1>
          <p>{t(signedOut ? 'exchange.signedOut.helpNow' : 'exchange.askDesk')}</p>
          {/* There is no scanner in the page: the way back in is the phone's camera on the visit's QR. */}
          {signedOut && (
            <p className="flex items-start gap-3 rounded-card bg-canvas px-5 py-3 font-semibold">
              <QrCode aria-hidden className="mt-0.5 size-6 shrink-0" />
              {t('exchange.signedOut.scanAgain')}
            </p>
          )}
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
    // A question is not urgent, and a stray tap would make a nurse task, so it asks first.
    if (c === 'desk_question') return setView({ name: 'confirmDesk' })
    void deliver({ kind: 'concern', concern: c, ...common() }, afterReport)
  }
  const sendDeskQuestion = () =>
    void deliver({ kind: 'concern', concern: 'desk_question', ...common() }, (receipt) => ({ name: 'desk', queued: receipt === null }))

  const submitCheckin = (report: CheckinReport) => void deliver(report, afterReport)
  const endSession = async (submission_id: string) => {
    await signOut({ submission_id })
    await qc.invalidateQueries({ queryKey: ['home'] })
  }
  const refreshPrompt = () => void qc.invalidateQueries({ queryKey: ['home'] })

  return (
    <PatientLayout
      home={home}
      about={view.name === 'home'}
      dock={{ onConcern: concern, onLeaving: () => setView({ name: 'confirmLeave' }), disabled: sending, helpOnly: circlePlaying }}
    >
      <div ref={content} className="space-y-5">
        {failed && (
          <p role="alert" className="flex items-start gap-2 rounded-card bg-level-red-bg px-5 py-3 font-semibold text-level-red">
            <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
            {t('patient.sendFailed')}
          </p>
        )}

        {view.name === 'home' && <Home home={home} now={now} setView={setView} onSignOut={endSession} />}

        {view.name === 'checkin' && (
          <CheckinFlow
            key={`full-${home.attention_prompt?.prompt_id ?? 'none'}`}
            home={home}
            sending={sending}
            onSubmit={submitCheckin}
            onCancel={() => setView({ name: 'home' })}
            onPromptExpired={refreshPrompt}
            onPlayingChange={setCirclePlaying}
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
          <Card className="space-y-3">
            <h1 className="text-heading font-semibold leading-tight tracking-tight">{t('leaving.title')}</h1>
            <p>{t('leaving.info')}</p>
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
              {t('leaving.confirm')}
            </Button>
            <Button size="lg" variant="secondary" className="w-full" onClick={() => setView({ name: 'home' })}>
              {t('leaving.cancel')}
            </Button>
          </Card>
        )}

        {view.name === 'confirmDesk' && (
          <Card className="space-y-3">
            <h1 className="text-heading font-semibold leading-tight tracking-tight">{t('desk.confirmTitle')}</h1>
            <p>{t('desk.confirmBody', { context: home.role === 'companion' ? 'companion' : undefined })}</p>
            <Button size="lg" className="w-full" disabled={sending} onClick={sendDeskQuestion}>
              {t('desk.confirm')}
            </Button>
            <Button size="lg" variant="secondary" className="w-full" onClick={() => setView({ name: 'home' })}>
              {t('desk.cancel')}
            </Button>
          </Card>
        )}

        {view.name === 'desk' && (
          <Card className="space-y-3">
            <h1 className="text-heading font-semibold leading-tight tracking-tight">
              {view.queued ? t('sent.queuedTitle') : t('desk.title')}
            </h1>
            <p>{view.queued ? t('sent.queuedBody') : t('desk.body')}</p>
            <p className="text-base text-muted">{t('desk.notClinical')}</p>
            <Button size="lg" className="w-full" onClick={() => setView({ name: 'home' })}>
              {t('sent.backHome')}
            </Button>
          </Card>
        )}

        {view.name === 'sent' && (
          <Card className="space-y-3">
            <h1 className="text-heading font-semibold leading-tight tracking-tight">
              {view.queued ? t('sent.queuedTitle') : t('sent.title')}
            </h1>
            {/* The status is the point of this screen: bold, with an icon, not muted. */}
            <p
              className={
                view.queued
                  ? 'flex items-start gap-3 rounded-card bg-level-amber-bg px-5 py-3 font-semibold text-level-amber'
                  : 'flex items-start gap-3 rounded-card bg-canvas px-5 py-3 font-semibold'
              }
            >
              {view.queued ? (
                <CloudOff aria-hidden className="mt-0.5 size-6 shrink-0" />
              ) : (
                <CircleCheckBig aria-hidden className="mt-0.5 size-6 shrink-0" />
              )}
              {view.queued ? t('sent.queuedBody') : t(`message.${view.message}`)}
            </p>
            {/* Leaving: after-leaving advice even when the report has not sent yet. */}
            {view.queued && view.message === 'leaving_info' && <p>{t('leaving.after')}</p>}
            {/* Never "all clear": staff still check on their own schedule. */}
            <p className="text-base text-muted">{t('sent.stillChecking')}</p>
            {/* Patient-safe timeline only: no task level or reasons ever reach this screen. */}
            <ol className="space-y-2 rounded-2xl bg-canvas p-4 text-base">
              <li className="flex items-center gap-2">
                <CircleCheckBig aria-hidden className="size-5 shrink-0" />
                {t('sent.reported')}
              </li>
              <li className={view.queued ? 'flex items-center gap-2 text-muted' : 'flex items-center gap-2'}>
                {view.queued ? <Clock aria-hidden className="size-5 shrink-0" /> : <CircleCheckBig aria-hidden className="size-5 shrink-0" />}
                {view.queued ? t('sent.waiting') : t('sent.received')}
              </li>
            </ol>
            <Button size="lg" className="w-full" onClick={() => setView({ name: 'home' })}>
              {t('sent.backHome')}
            </Button>
            {view.followUps && view.followUps.length > 0 && (
              <Button size="lg" variant="ghost" className="w-full" onClick={() => setView({ name: 'followup', keys: view.followUps! })}>
                {t('sent.followup', { count: view.followUps.length })}
              </Button>
            )}
          </Card>
        )}
      </div>
    </PatientLayout>
  )
}

function Home({ home, now, setView, onSignOut }: { home: PatientHome; now: number; setView: (v: View) => void; onSignOut: (submissionId: string) => Promise<void> }) {
  const { t } = useTranslation()
  return (
    <div>
      <h1>{t(home.role === 'companion' ? 'patient.titleCompanion' : 'patient.homeTitle')}</h1>
      {home.role === 'companion' && <p className="mt-2 text-base text-muted">{t('patient.companionHint')}</p>}
      {home.message !== 'none' && <p className="mt-3 rounded-card border border-line bg-surface px-5 py-4 text-base">{t(`message.${home.message}`)}</p>}
      <section className="patient-checkin-card" aria-label={t('patient.nextCheckin')}>
        <Button size="lg" className="w-full justify-between" onClick={() => setView({ name: 'checkin' })}>
          {t('patient.startCheckin')}
          <ArrowRight aria-hidden className="size-5 rtl:-scale-x-100" />
        </Button>
        <div className="patient-next">
          <span>{t('patient.nextCheckin')}</span>
          <CountdownChip due={home.next_checkin_due_at} now={now} patient />
        </div>
      </section>
      {/* The two actions below the check-in line up: both full width and centred. */}
      <Button size="lg" variant="secondary" className="mt-4 w-full" onClick={() => setView({ name: 'change' })}>
        {t('patient.reportChange', { context: home.role === 'companion' ? 'companion' : undefined })}
      </Button>
      <SignOutButton onSignOut={onSignOut} />
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
      <Button variant="ghost" className="mt-1 w-full text-muted" onClick={() => setConfirm(true)}>
        {t('patient.signOut')}
      </Button>
    )
  }
  return (
    <Card className="mt-2 space-y-3">
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
  const [needOne, setNeedOne] = useState(false)
  return (
    <section aria-labelledby="change" className="space-y-4">
      <button type="button" className="back-link mb-0!" onClick={onCancel}>
        <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
        {t('flow.back')}
      </button>
      <h1 id="change" className="text-heading font-semibold leading-tight tracking-tight">
        {text('new_findings', home.role)}
      </h1>
      <div role="group" aria-labelledby="change" className="answer-list">
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
      {/* Stays enabled, as in the check-in: a disabled button gives no reason, so say what is missing. */}
      <Button size="lg" className="w-full" disabled={sending} onClick={() => (picked.length > 0 ? onSend(picked) : setNeedOne(true))}>
        {t('change.send')}
      </Button>
      {needOne && picked.length === 0 && (
        <p ref={(el) => el?.scrollIntoView?.({ block: 'nearest' })} role="alert" className="font-semibold text-level-red">
          {t('change.chooseOne')}
        </p>
      )}
    </section>
  )
}
