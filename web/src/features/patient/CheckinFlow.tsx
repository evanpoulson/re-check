import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { allowUnsure, noneOption, options, text } from '@/api/bank'
import { newSubmissionId } from '@/api/client'
import { baseItems } from '@/api/enableWhen'
import type { CheckinReport, FindingCode, ItemAnswer, PatientHome, QuestionItem, Role } from '@/api/types'
import { AnswerButton } from '@/components/AnswerButton'
import { CircleCheck } from '@/components/CircleCheck'
import { Button } from '@/components/ui/button'
import { buildCheckinReport, type AttentionDraft, type CheckinDraft } from '@/lib/checkin'

type Step = { kind: 'base'; linkId: string } | { kind: 'item'; item: QuestionItem }
const unsure: ItemAnswer = { kind: 'missing', reason: 'unsure' }

interface Props {
  home: PatientHome
  /** `followup` asks only these item keys, after an urgent finding was routed. */
  mode?: 'full' | 'followup'
  itemKeys?: string[]
  onSubmit: (report: CheckinReport) => void
  onCancel: () => void
  /** The circle prompt expired; fetch a fresh one. */
  onPromptExpired: () => void
  sending?: boolean
}

/**
 * One question per screen, in the order the question bank's base section sets:
 * who is answering, two wellness questions, pain (patient), new warning signs,
 * the circle check (patient), then the visit's follow-up questions. Leaving
 * early sends what was answered as a partial check-in.
 */
export function CheckinFlow({ home, mode = 'full', itemKeys, onSubmit, onCancel, onPromptExpired, sending }: Props) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  useEffect(() => { document.getElementById('q')?.focus() }, [index])
  // The QR already says who is answering, so preselect it. The answer becomes the report's reporter.
  const [reporter, setReporter] = useState<Role>(home.role)
  const [draft, setDraft] = useState<CheckinDraft>({ items: {} })
  // Created once and reused, so a retry of the same check-in is a duplicate, not a new report.
  const submissionId = useRef(newSubmissionId())

  const items = useMemo(
    () => (mode === 'followup' ? home.items.filter((i) => itemKeys?.includes(i.key)) : home.items),
    [home.items, mode, itemKeys],
  )
  const prompt = home.attention_prompt ?? null

  const steps: Step[] = useMemo(() => {
    if (mode === 'followup') return items.map((item): Step => ({ kind: 'item', item }))
    const base = baseItems(reporter)
      // The circle check needs a prompt from the server, and only the patient does it.
      .filter((id) => id !== 'circle_count' || (reporter === 'patient' && prompt))
      .map((linkId): Step => ({ kind: 'base', linkId }))
    return [...base, ...items.map((item): Step => ({ kind: 'item', item }))]
  }, [mode, reporter, items, prompt])

  const step = steps[Math.min(index, steps.length - 1)]!
  const last = index >= steps.length - 1

  const answered = (s: Step, d: CheckinDraft): boolean => {
    if (s.kind === 'item') return d.items[s.item.key] !== undefined
    switch (s.linkId) {
      case 'answerer': return true
      case 'feeling_now': return d.feelingNow !== undefined
      case 'feeling_change': return d.feelingChange !== undefined
      case 'pain': return d.pain !== undefined
      case 'new_findings': return d.findings !== undefined
      case 'circle_count': return d.attention !== undefined
      default: return false
    }
  }
  const anyAnswered = steps.some((s) => s.kind !== 'base' || s.linkId !== 'answerer' ? answered(s, draft) : false)

  function send(d: CheckinDraft) {
    onSubmit(
      buildCheckinReport({
        draft: d,
        reporter,
        version: home.questionnaire_version,
        submissionId: submissionId.current,
        capturedAt: new Date().toISOString(),
        itemKeys: items.map((i) => i.key),
        prompt,
        mode,
      }),
    )
  }
  const next = (d: CheckinDraft) => (last ? send(d) : setIndex(index + 1))

  const onCircleDone = (a: AttentionDraft) => {
    const d = { ...draft, attention: a }
    setDraft(d)
    next(d)
  }

  return (
    <section aria-labelledby="q" className="space-y-5">
      <div className="question-progress"><span>{t('flow.progress', { n: index + 1, total: steps.length })}</span><progress aria-label="Check-in progress" value={index + 1} max={steps.length} /></div>

      {step.kind === 'base' && step.linkId === 'circle_count' && prompt ? (
        <CircleCheck key={prompt.prompt_id} prompt={prompt} role={reporter} onDone={onCircleDone} onExpired={onPromptExpired} />
      ) : (
        <>
          <StepView step={step} reporter={reporter} setReporter={setReporter} draft={draft} setDraft={setDraft} />
          <div className="grid gap-3">
            <Button size="lg" disabled={!answered(step, draft) || sending} onClick={() => next(draft)}>
              {last ? t('flow.send') : t('flow.next')}
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" size="lg" disabled={index === 0 || sending} onClick={() => setIndex(index - 1)}>
                {t('flow.back')}
              </Button>
              <Button variant="secondary" size="lg" disabled={sending} onClick={() => (anyAnswered ? send(draft) : onCancel())}>
                {t('flow.finishLater')}
              </Button>
            </div>
            <p className="text-base text-muted">{t('flow.finishLaterHelp')}</p>
          </div>
        </>
      )}
    </section>
  )
}

interface ViewProps {
  step: Step
  reporter: Role
  setReporter: (r: Role) => void
  draft: CheckinDraft
  setDraft: (d: CheckinDraft) => void
}

function Question({ children }: { children: string }) {
  return (
    <h1 tabIndex={-1} id="q" className="text-[1.75rem] font-extrabold leading-tight tracking-tight">
      {children}
    </h1>
  )
}

function ScaleButtons({ value, onPick }: { value: number | 'unsure' | undefined; onPick: (n: number) => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 11 }, (_, n) => (
          <AnswerButton key={n} selected={value === n} className="justify-center px-0 border-l" onClick={() => onPick(n)}>
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

function NotSure({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <AnswerButton selected={selected} onClick={onClick}>
      {t('answer.unsure')}
    </AnswerButton>
  )
}

function StepView({ step, reporter, setReporter, draft, setDraft }: ViewProps) {
  if (step.kind === 'item') return <ItemStep item={step.item} draft={draft} setDraft={setDraft} />
  const { linkId } = step

  if (linkId === 'answerer') {
    return (
      <>
        <Question>{text('answerer', reporter)}</Question>
        <div className="grid gap-3">
          {options('answerer').map((o) => (
            <AnswerButton key={o.code} selected={reporter === o.code} onClick={() => setReporter(o.code as Role)}>
              {o.text}
            </AnswerButton>
          ))}
        </div>
      </>
    )
  }

  if (linkId === 'feeling_now' || linkId === 'feeling_change') {
    const key = linkId === 'feeling_now' ? 'feelingNow' : 'feelingChange'
    const value = draft[key]
    return (
      <>
        <Question>{text(linkId, reporter)}</Question>
        <div className="grid gap-3">
          {options(linkId).map((o) => (
            <AnswerButton key={o.code} selected={value === o.code} onClick={() => setDraft({ ...draft, [key]: o.code })}>
              {o.text}
            </AnswerButton>
          ))}
          {allowUnsure(linkId) && <NotSure selected={value === 'unsure'} onClick={() => setDraft({ ...draft, [key]: 'unsure' })} />}
        </div>
      </>
    )
  }

  if (linkId === 'pain') {
    return (
      <>
        <Question>{text('pain', reporter)}</Question>
        <ScaleButtons value={draft.pain} onPick={(n) => setDraft({ ...draft, pain: n })} />
        {allowUnsure('pain') && <NotSure selected={draft.pain === 'unsure'} onClick={() => setDraft({ ...draft, pain: 'unsure' })} />}
      </>
    )
  }

  if (linkId === 'new_findings') {
    const picked = Array.isArray(draft.findings) ? draft.findings : []
    const toggle = (f: FindingCode) =>
      setDraft({ ...draft, findings: picked.includes(f) ? picked.filter((x) => x !== f) : [...picked, f] })
    return (
      <>
        <Question>{text('new_findings', reporter)}</Question>
        <div className="grid gap-3">
          {options('new_findings').map((o) => (
            <AnswerButton key={o.code} selected={picked.includes(o.code as FindingCode)} onClick={() => toggle(o.code as FindingCode)}>
              {o.text}
            </AnswerButton>
          ))}
          <AnswerButton selected={Array.isArray(draft.findings) && picked.length === 0} onClick={() => setDraft({ ...draft, findings: [] })}>
            {noneOption('new_findings') ?? ''}
          </AnswerButton>
          {allowUnsure('new_findings') && <NotSure selected={draft.findings === 'unsure'} onClick={() => setDraft({ ...draft, findings: 'unsure' })} />}
        </div>
      </>
    )
  }

  return null
}

/** A follow-up item from PatientHome. Wording and "Not sure" come from the API, not the UI. */
function ItemStep({ item, draft, setDraft }: { item: QuestionItem; draft: CheckinDraft; setDraft: (d: CheckinDraft) => void }) {
  const { t } = useTranslation()
  const current = draft.items[item.key]
  const set = (a: ItemAnswer) => setDraft({ ...draft, items: { ...draft.items, [item.key]: a } })
  const multi = current?.kind === 'multi_choice' ? current.value : []

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
          (item.options ?? []).map((o) => (
            <AnswerButton
              key={o.code}
              selected={multi.includes(o.code)}
              onClick={() => set({ kind: 'multi_choice', value: multi.includes(o.code) ? multi.filter((x) => x !== o.code) : [...multi, o.code] })}
            >
              {o.text}
            </AnswerButton>
          ))}
        {item.input_type === 'scale' && (
          <ScaleButtons value={current?.kind === 'scale' ? current.value : undefined} onPick={(n) => set({ kind: 'scale', value: n })} />
        )}
        {item.allow_unsure !== false && <NotSure selected={current?.kind === 'missing'} onClick={() => set(unsure)} />}
      </div>
    </>
  )
}
