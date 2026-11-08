import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPatientHome } from '@/api/api'
import { ApiError, newSubmissionId } from '@/api/client'
import type { CheckinReport, ConcernCode, FindingCode, PatientHome, PatientMessage, PatientReport, ReportReceipt } from '@/api/types'
import { CountdownChip } from '@/components/CountdownChip'
import { AnswerButton } from '@/components/AnswerButton'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { sendReport } from '@/lib/outbox'
import { useNow } from '@/lib/time'
import { CheckinFlow, FINDINGS } from './CheckinFlow'
import { PatientLayout } from './PatientLayout'

type View =
  | { name: 'home' }
  | { name: 'checkin' }
  | { name: 'change' }
  | { name: 'confirmLeave' }
  | { name: 'followup'; keys: string[] }
  | { name: 'urgent'; queued: boolean; followUps: string[] }
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
        <Card role="alert" className="space-y-2">
          <h1 className="text-2xl font-bold">{t(noSession ? 'exchange.noSession.title' : 'exchange.invalid.title')}</h1>
          <p>{t('exchange.askDesk')}</p>
        </Card>
      </PatientLayout>
    )
  }

  const common = () => ({
    submission_id: newSubmissionId(),
    reporter: home.role,
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
    } catch {
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

  const concern = (c: ConcernCode) =>
    void deliver({ kind: 'concern', concern: c, ...common() }, (receipt) =>
      // A help request always shows the "tell staff now" screen, even if it could not be sent yet.
      receipt ? { name: 'urgent', queued: false, followUps: receipt.follow_up_items ?? [] } : { name: 'urgent', queued: true, followUps: [] },
    )

  const submitCheckin = (report: CheckinReport) => void deliver(report, afterReport)

  return (
    <PatientLayout home={home} onConcern={concern}>
      {failed && (
        <p role="alert" className="rounded-xl bg-level-red-bg p-3 font-semibold text-level-red">
          {t('patient.sendFailed')}
        </p>
      )}

      {view.name === 'home' && <Home home={home} now={now} setView={setView} />}

      {view.name === 'checkin' && (
        <CheckinFlow key="full" home={home} sending={sending} onSubmit={submitCheckin} onCancel={() => setView({ name: 'home' })} />
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
        />
      )}

      {view.name === 'change' && (
        <ReportChange
          sending={sending}
          onCancel={() => setView({ name: 'home' })}
          onSend={(findings) =>
            void deliver({ kind: 'finding', findings: findings as [FindingCode, ...FindingCode[]], ...common() }, afterReport)
          }
        />
      )}

      {view.name === 'confirmLeave' && (
        <Card className="space-y-3">
          <h1 className="text-2xl font-bold">{t('leaving.title')}</h1>
          <p>{t('leaving.info')}</p>
          <Button
            size="lg"
            variant="danger"
            disabled={sending}
            onClick={() => void deliver({ kind: 'leaving', ...common() }, (r) => (r ? { name: 'sent', queued: false, message: r.patient_message } : { name: 'sent', queued: true, message: 'leaving_info' }))}
          >
            {t('leaving.confirm')}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setView({ name: 'home' })}>{t('leaving.cancel')}</Button>
        </Card>
      )}

      {view.name === 'urgent' && (
        <Card role="alert" className="space-y-3 border-2 border-level-red bg-level-red-bg">
          <h1 className="text-3xl font-bold text-level-red">{t('urgent.title')}</h1>
          <p className="text-xl">{t('urgent.body')}</p>
          <p className="font-semibold">{view.queued ? t('urgent.queued') : t('urgent.sent')}</p>
          <Button
            size="lg"
            variant="danger"
            onClick={() => setView(view.followUps.length > 0 ? { name: 'followup', keys: view.followUps } : { name: 'home' })}
          >
            {t('urgent.telling')}
          </Button>
        </Card>
      )}

      {view.name === 'sent' && (
        <Card className="space-y-3">
          <h1 className="text-2xl font-bold">{view.queued ? t('sent.queuedTitle') : t('sent.title')}</h1>
          <p>{view.queued ? t('sent.queuedBody') : t(`message.${view.message}`)}</p>
          {/* Patient-safe timeline only: no task level or reasons ever reach this screen. */}
          <ol className="space-y-1 border-l-2 border-line pl-4 text-base">
            <li>{t('sent.reported')}</li>
            <li className={view.queued ? 'text-muted' : ''}>{view.queued ? t('sent.waiting') : t('sent.received')}</li>
          </ol>
          <Button size="lg" onClick={() => setView({ name: 'home' })}>{t('sent.back')}</Button>
        </Card>
      )}
    </PatientLayout>
  )
}

function Home({ home, now, setView }: { home: PatientHome; now: number; setView: (v: View) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t(home.role === 'companion' ? 'patient.titleCompanion' : 'patient.title')}</h1>
      {home.message !== 'none' && <p className="rounded-xl bg-brand-50 p-3">{t(`message.${home.message}`)}</p>}
      <Card className="space-y-1">
        <div className="text-base font-semibold text-muted">{t('patient.nextCheckin')}</div>
        <div className="text-xl"><CountdownChip due={home.next_checkin_due_at} now={now} /></div>
      </Card>
      <div className="grid gap-3">
        <Button size="lg" onClick={() => setView({ name: 'checkin' })}>{t('patient.startCheckin')}</Button>
        <Button size="lg" variant="secondary" onClick={() => setView({ name: 'change' })}>{t('patient.reportChange')}</Button>
        <Button size="lg" variant="secondary" onClick={() => setView({ name: 'confirmLeave' })}>{t('patient.leaving')}</Button>
      </div>
    </div>
  )
}

/** Report one or more new warning signs outside a scheduled check-in. */
function ReportChange({ onSend, onCancel, sending }: { onSend: (f: FindingCode[]) => void; onCancel: () => void; sending: boolean }) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<FindingCode[]>([])
  return (
    <section aria-labelledby="change" className="space-y-4">
      <h1 id="change" className="text-2xl font-bold">{t('change.title')}</h1>
      <p className="text-base text-muted">{t('q.findingsHelp')}</p>
      <div className="grid gap-3">
        {FINDINGS.map((f) => (
          <AnswerButton
            key={f}
            selected={picked.includes(f)}
            onClick={() => setPicked(picked.includes(f) ? picked.filter((x) => x !== f) : [...picked, f])}
          >
            {t(`finding.${f}`)}
          </AnswerButton>
        ))}
      </div>
      <Button size="lg" disabled={picked.length === 0 || sending} onClick={() => onSend(picked)}>{t('change.send')}</Button>
      <Button size="lg" variant="secondary" onClick={onCancel}>{t('flow.back')}</Button>
    </section>
  )
}
