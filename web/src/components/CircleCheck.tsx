import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
}

const SHAPE = 'absolute size-20 -translate-x-1/2 -translate-y-1/2 border-[7px] border-ink'

/**
 * The circle-counting reliability check. Shapes appear one at a time as the
 * server issued them; the patient counts the circles and ignores the squares.
 * Circles and squares differ by outline shape, not by colour. It is not a
 * clinical test: a wrong or missing count only asks staff to check in person.
 */
export function CircleCheck({ prompt, role, onDone, onExpired }: Props) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('intro')
  const [visible, setVisible] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

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
      <h1 id="circle-q" className="text-[1.75rem] font-extrabold leading-tight tracking-tight">
        {text('circle_count', role)}
      </h1>

      {phase === 'intro' && (
        <>
          <p className="text-lg">{t('circle.intro')}</p>
          <p className="text-base text-muted">{t('circle.once')}</p>
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
            aria-hidden
            className="relative aspect-square w-full rounded-data border-2 border-line bg-surface"
            data-testid="play-area"
          >
            {visible !== null && (
              <span
                data-testid={`shape-${prompt.steps[visible]!.shape}`}
                className={cn(SHAPE, prompt.steps[visible]!.shape === 'circle' ? 'rounded-full' : 'rounded-none')}
                style={{ left: `${prompt.steps[visible]!.x * 100}%`, top: `${prompt.steps[visible]!.y * 100}%` }}
              />
            )}
          </div>
          <Button size="lg" variant="secondary" className="w-full" onClick={cantDo}>
            {t('circle.cantDo')}
          </Button>
        </>
      )}

      {phase === 'count' && (
        <>
          <div className="flex items-center justify-center gap-4" role="group" aria-label={t('circle.countLabel')}>
            <Button size="lg" variant="secondary" aria-label={t('circle.fewer')} disabled={count <= 0} onClick={() => setCount(count - 1)}>
              <Minus aria-hidden className="size-6" />
            </Button>
            <output aria-live="polite" className="tabular min-w-20 text-center text-6xl font-extrabold">
              {count}
            </output>
            <Button size="lg" variant="secondary" aria-label={t('circle.more')} disabled={count >= 20} onClick={() => setCount(count + 1)}>
              <Plus aria-hidden className="size-6" />
            </Button>
          </div>
          <Button size="lg" className="w-full" onClick={() => onDone({ shown: true, count })}>
            {t('circle.confirm')}
          </Button>
          {allowUnsure('circle_count') && (
            <Button size="lg" variant="secondary" className="w-full" onClick={unsure}>
              {t('answer.unsure')}
            </Button>
          )}
          <Button size="lg" variant="secondary" className="w-full" onClick={cantDo}>
            {t('circle.cantDo')}
          </Button>
        </>
      )}
    </section>
  )
}
