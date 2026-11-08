import { Minus, Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { allowUnsure, text } from '@/api/bank'
import type { AttentionPrompt, Role } from '@/api/types'
import { Button } from '@/components/ui/button'
import type { AttentionDraft } from '@/lib/checkin'
import { cn } from '@/lib/utils'

type Phase = 'intro' | 'playing' | 'count'

interface Props {
  prompt: AttentionPrompt
  role: Role
  /** The patient's result. The check is shown once: there is no replay. */
  onDone: (result: AttentionDraft) => void
  /** The server's prompt has expired. The parent fetches a new one. */
  onExpired: () => void
  /** True while the shapes play, so the page can hide everything but "I need help now". */
  onPlayingChange?: (playing: boolean) => void
}

// A quarter of the inset box is a fifth of the play area, so shapes scale with it.
const SHAPE = 'absolute aspect-square w-1/4 -translate-x-1/2 -translate-y-1/2 border-[7px] border-ink'

/**
 * The largest square that fits between the sticky header and the help dock, so
 * every shape is on screen however small the phone or large the text.
 */
function stageSize(): number {
  const header = document.querySelector('.patient-shell > header')?.getBoundingClientRect().height ?? 0
  const dock = document.querySelector('.patient-dock')?.getBoundingClientRect().height ?? 0
  return Math.max(160, window.innerHeight - header - dock - 32)
}

/**
 * The circle-counting reliability check. Shapes appear one at a time as the
 * server issued them; the patient counts the circles and ignores the squares.
 * Circles and squares differ by outline shape, not by colour. It is not a
 * clinical test: a wrong or missing count only asks staff to check in person.
 */
export function CircleCheck({ prompt, role, onDone, onExpired, onPlayingChange }: Props) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('intro')
  const [visible, setVisible] = useState<number | null>(null)
  // Empty until the patient taps, so one tap on Done can never send a count of 0.
  const [count, setCount] = useState<number | null>(null)
  const [needCount, setNeedCount] = useState(false)
  const [maxSize, setMaxSize] = useState<number | null>(null)
  const timers = useRef<number[]>([])
  const stage = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const playing = phase === 'playing'

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    onPlayingChange?.(playing)
  }, [playing, onPlayingChange])
  useEffect(() => () => onPlayingChange?.(false), [onPlayingChange])

  // The heading now asks the question: show it and move focus to it.
  useEffect(() => {
    if (phase !== 'count') return
    heading.current?.focus({ preventScroll: true })
    heading.current?.closest('section')?.scrollIntoView?.({ block: 'start' })
  }, [phase])

  // Size the play area to the visible space, then bring all of it into view.
  useLayoutEffect(() => {
    if (!playing) return
    const fit = () => setMaxSize(stageSize())
    fit()
    // Again once the dock has shrunk to just "I need help now".
    const frame = requestAnimationFrame(() => {
      fit()
      requestAnimationFrame(() => stage.current?.scrollIntoView?.({ block: 'center' }))
    })
    window.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', fit)
    }
  }, [playing])

  function start() {
    if (Date.parse(prompt.expires_at) <= Date.now()) return onExpired()
    setPhase('playing')
    let at = 600
    prompt.steps.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setVisible(i), at))
      timers.current.push(window.setTimeout(() => setVisible(null), at + prompt.show_ms))
      at += prompt.show_ms + prompt.gap_ms
    })
    timers.current.push(window.setTimeout(() => setPhase('count'), at))
  }

  // Leaving the check is "shown but not answered": the prompt id is still sent.
  const cantDo = () => onDone({ shown: true, skip: 'unable_to_respond' })
  const unsure = () => onDone({ shown: true, skip: 'unsure' })

  return (
    <section aria-labelledby="circle-q" className="space-y-4">
      {/* The question is asked only once there is something to count. */}
      <h1 ref={heading} tabIndex={-1} id="circle-q" className="text-[1.75rem] font-semibold leading-tight tracking-tight">
        {phase === 'count' ? text('circle_count', role) : t('circle.title')}
      </h1>

      {phase === 'intro' && (
        <>
          <p className="text-lg">{t('circle.intro')}</p>
          <p className="text-base text-muted">{t('circle.once')}</p>
          <p className="text-base text-muted">{t('circle.notTest')}</p>
          <Button size="lg" className="w-full" onClick={start}>
            {t('circle.start')}
          </Button>
          <Button size="lg" variant="secondary" className="w-full" onClick={cantDo}>
            {t('circle.cantDo')}
          </Button>
        </>
      )}

      {phase === 'playing' && (
        <>
          <p role="status" className="text-lg font-semibold">
            {t('circle.watch')}
          </p>
          <div
            ref={stage}
            aria-hidden
            className="relative mx-auto aspect-square w-full rounded-card bg-surface shadow-card"
            style={maxSize ? { maxWidth: maxSize } : undefined}
            data-testid="play-area"
          >
            {/* Positions are inset by half a shape, so a shape at 0 or 1 is still whole. */}
            <div className="absolute inset-[10%]">
              {visible !== null && (
                <span
                  data-testid={`shape-${prompt.steps[visible]!.shape}`}
                  className={cn(SHAPE, prompt.steps[visible]!.shape === 'circle' ? 'rounded-full' : 'rounded-none')}
                  style={{ left: `${prompt.steps[visible]!.x * 100}%`, top: `${prompt.steps[visible]!.y * 100}%` }}
                />
              )}
            </div>
          </div>
          <Button size="lg" variant="secondary" className="w-full" onClick={cantDo}>
            {t('circle.cantDo')}
          </Button>
        </>
      )}

      {phase === 'count' && (
        <>
          <div className="flex items-center justify-center gap-4" role="group" aria-label={t('circle.countLabel')}>
            <Button
              size="lg"
              variant="secondary"
              aria-label={t('circle.fewer')}
              disabled={count === 0}
              onClick={() => setCount(Math.max(0, (count ?? 1) - 1))}
            >
              <Minus aria-hidden className="size-6" />
            </Button>
            <output aria-live="polite" className="tabular min-w-20 text-center text-7xl font-semibold tracking-tight">
              {count ?? '\u2013'}
            </output>
            <Button
              size="lg"
              variant="secondary"
              aria-label={t('circle.more')}
              disabled={count !== null && count >= 20}
              onClick={() => setCount(count === null ? 1 : count + 1)}
            >
              <Plus aria-hidden className="size-6" />
            </Button>
          </div>
          {/* Stays enabled: say what is missing instead of a silent disabled button. */}
          <Button size="lg" className="w-full" onClick={() => (count === null ? setNeedCount(true) : onDone({ shown: true, count }))}>
            {t('circle.confirm')}
          </Button>
          {needCount && count === null && (
            <p role="alert" className="font-semibold text-level-red">
              {t('circle.chooseCount')}
            </p>
          )}
          <div className="grid gap-1">
            {allowUnsure('circle_count') && (
              <Button variant="ghost" onClick={unsure}>
                {t('answer.unsure')}
              </Button>
            )}
            <Button variant="ghost" onClick={cantDo}>
              {t('circle.cantDo')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
