import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { newSubmissionId } from '@/api/client'
import type { CheckinReport, FindingCode, ItemAnswer, Overall, PatientHome, QuestionItem } from '@/api/types'
import { AnswerButton } from '@/components/AnswerButton'
import { Button } from '@/components/ui/button'
import { buildCheckinReport, type CheckinDraft } from '@/lib/checkin'

export const FINDINGS: FindingCode[] = [
  'chest_pain',
  'trouble_breathing',
  'new_confusion',
  'fainting',
  'new_weakness_numbness',
  'heavy_bleeding',
  'vomiting',
  'worst_headache',
  'speech_change',
  'facial_droop',
  'drowsiness',
  'vision_change',
  'balance_change',
]

type Step = { kind: 'overall' } | { kind: 'pain' } | { kind: 'findings' } | { kind: 'item'; item: QuestionItem }
const unsure: ItemAnswer = { kind: 'missing', reason: 'unsure' }

interface Props {
  home: PatientHome
  /** `followup` asks only these item keys, after an urgent finding was routed. */
  mode?: 'full' | 'followup'
  itemKeys?: string[]
  onSubmit: (report: CheckinReport) => void
  onCancel: () => void
  sending?: boolean
}

/** One question per screen. Leaving early sends what was answered as a partial check-in. */
export function CheckinFlow({ home, mode = 'full', itemKeys, onSubmit, onCancel, sending }: Props) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<CheckinDraft>({ items: {} })
  // Created once and reused, so a retry of the same check-in is a duplicate, not a new report.
  const submissionId = useRef(newSubmissionId())

  const items = useMemo(
    () => (mode === 'followup' ? home.items.filter((i) => itemKeys?.includes(i.key)) : home.items),
    [home.items, mode, itemKeys],
  )
  const steps: Step[] = useMemo(
    () =>
      mode === 'followup'
        ? items.map((item) => ({ kind: 'item', item }))
        : [
            { kind: 'overall' },
            ...(home.role === 'patient' ? [{ kind: 'pain' } as Step] : []),
            { kind: 'findings' },
            ...items.map((item): Step => ({ kind: 'item', item })),
          ],
    [mode, home.role, items],
  )
  const step = steps[index]!
  const last = index === steps.length - 1

  const answered = (s: Step): boolean => {
    switch (s.kind) {
      case 'overall': return draft.overall !== undefined
      case 'pain': return draft.pain !== undefined
      case 'findings': return draft.findings !== undefined
      default: return draft.items[s.item.key] !== undefined
    }
  }
  const anyAnswered = steps.some(answered)

  function send() {
    onSubmit(
      buildCheckinReport({
        draft,
        role: home.role,
        version: home.questionnaire_version,
        submissionId: submissionId.current,
        capturedAt: new Date().toISOString(),
        itemKeys: items.map((i) => i.key),
        mode,
      }),
    )
  }

  return (
    <section aria-labelledby="q" className="space-y-4">
      <div>
        <progress className="h-2 w-full" max={steps.length} value={index + 1} aria-label={t('flow.progress', { n: index + 1, total: steps.length })} />
        <p className="mt-1 text-base text-muted">{t('flow.progress', { n: index + 1, total: steps.length })}</p>
      </div>

      <StepView step={step} role={home.role} draft={draft} setDraft={setDraft} />

      <div className="grid gap-3">
        <Button size="lg" disabled={!answered(step) || sending} onClick={() => (last ? send() : setIndex(index + 1))}>
          {last ? t('flow.send') : t('flow.next')}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" disabled={index === 0 || sending} onClick={() => setIndex(index - 1)}>
            {t('flow.back')}
          </Button>
          <Button variant="secondary" size="lg" disabled={sending} onClick={() => (anyAnswered ? send() : onCancel())}>
            {t('flow.finishLater')}
          </Button>
        </div>
        <p className="text-base text-muted">{t('flow.finishLaterHelp')}</p>
      </div>
    </section>
  )
}

interface ViewProps {
  step: Step
  role: PatientHome['role']
  draft: CheckinDraft
  setDraft: (d: CheckinDraft) => void
}

function Question({ children }: { children: string }) {
  return <h1 id="q" className="text-2xl font-bold">{children}</h1>
}

function ScaleButtons({ value, onPick }: { value: number | 'unsure' | undefined; onPick: (n: number) => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 11 }, (_, n) => (
          <AnswerButton key={n} selected={value === n} className="justify-center px-0" onClick={() => onPick(n)}>
            {n}
          </AnswerButton>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-base text-muted">
        <span>{t('pain.low')}</span>
        <span>{t('pain.high')}</span>
      </div>
    </div>
  )
}

function StepView({ step, role, draft, setDraft }: ViewProps) {
  const { t } = useTranslation()

  if (step.kind === 'overall') {
    const options: Overall[] = ['better', 'same', 'worse']
    return (
      <>
        <Question>{t(`q.overall.${role}`)}</Question>
        <div className="grid gap-3">
          {options.map((o) => (
            <AnswerButton key={o} selected={draft.overall === o} onClick={() => setDraft({ ...draft, overall: o })}>
              {t(`overall.${o}`)}
            </AnswerButton>
          ))}
          <AnswerButton selected={draft.overall === 'unsure'} onClick={() => setDraft({ ...draft, overall: 'unsure' })}>
            {t('answer.unsure')}
          </AnswerButton>
        </div>
      </>
    )
  }

  if (step.kind === 'pain') {
    return (
      <>
        <Question>{t('q.pain')}</Question>
        <ScaleButtons value={draft.pain} onPick={(n) => setDraft({ ...draft, pain: n })} />
        <AnswerButton selected={draft.pain === 'unsure'} onClick={() => setDraft({ ...draft, pain: 'unsure' })}>
          {t('answer.unsure')}
        </AnswerButton>
      </>
    )
  }

  if (step.kind === 'findings') {
    const picked = Array.isArray(draft.findings) ? draft.findings : []
    const toggle = (f: FindingCode) =>
      setDraft({ ...draft, findings: picked.includes(f) ? picked.filter((x) => x !== f) : [...picked, f] })
    return (
      <>
        <Question>{t(`q.findings.${role}`)}</Question>
        <p className="text-base text-muted">{t('q.findingsHelp')}</p>
        <div className="grid gap-3">
          {FINDINGS.map((f) => (
            <AnswerButton key={f} selected={picked.includes(f)} onClick={() => toggle(f)}>
              {t(`finding.${f}`)}
            </AnswerButton>
          ))}
          <AnswerButton selected={Array.isArray(draft.findings) && picked.length === 0} onClick={() => setDraft({ ...draft, findings: [] })}>
            {t('answer.noneOfThese')}
          </AnswerButton>
          <AnswerButton selected={draft.findings === 'unsure'} onClick={() => setDraft({ ...draft, findings: 'unsure' })}>
            {t('answer.unsure')}
          </AnswerButton>
        </div>
      </>
    )
  }

  const { item } = step
  const current = draft.items[item.key]
  const set = (a: ItemAnswer) => setDraft({ ...draft, items: { ...draft.items, [item.key]: a } })
  const isUnsure = current?.kind === 'missing'

  return (
    <>
      <Question>{item.text}</Question>
      <div className="grid gap-3">
        {item.input_type === 'yes_no' && (
          <>
            <AnswerButton selected={current?.kind === 'yes_no' && current.value} onClick={() => set({ kind: 'yes_no', value: true })}>
              {t('common.yes')}
            </AnswerButton>
            <AnswerButton selected={current?.kind === 'yes_no' && !current.value} onClick={() => set({ kind: 'yes_no', value: false })}>
              {t('common.no')}
            </AnswerButton>
          </>
        )}
        {item.input_type === 'choice' &&
          (item.options ?? []).map((o) => (
            <AnswerButton key={o.code} selected={current?.kind === 'choice' && current.value === o.code} onClick={() => set({ kind: 'choice', value: o.code })}>
              {o.text}
            </AnswerButton>
          ))}
        {item.input_type === 'multi_choice' &&
          (item.options ?? []).map((o) => {
            const picked = current?.kind === 'multi_choice' ? current.value : []
            return (
              <AnswerButton
                key={o.code}
                selected={picked.includes(o.code)}
                onClick={() => set({ kind: 'multi_choice', value: picked.includes(o.code) ? picked.filter((x) => x !== o.code) : [...picked, o.code] })}
              >
                {o.text}
              </AnswerButton>
            )
          })}
        {item.input_type === 'scale' && (
          <ScaleButtons value={current?.kind === 'scale' ? current.value : undefined} onPick={(n) => set({ kind: 'scale', value: n })} />
        )}
        <AnswerButton selected={isUnsure} onClick={() => set(unsure)}>
          {t('answer.unsure')}
        </AnswerButton>
      </div>
    </>
  )
}
