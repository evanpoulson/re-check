import { alwaysVisible, text } from '@/api/bank'
import type { ConcernCode, Role } from '@/api/types'
import { Button } from '@/components/ui/button'

interface Props {
  role: Role
  onConcern: (c: ConcernCode) => void
  onLeaving: () => void
  disabled?: boolean
}

/**
 * The four always-visible buttons from the question bank, docked to the bottom
 * of every patient screen. "I need help now" is full width; the other three share
 * a row. Wording (and companion wording) comes from the bank. "Question about my
 * wait or care" is non-clinical and goes to the triage nurse, not a physician.
 */
export function HelpBar({ role, onConcern, onLeaving, disabled }: Props) {
  const buttons = alwaysVisible()
  const help = buttons.find((b) => b.concern === 'help_now')
  const rest = buttons.filter((b) => b.concern !== 'help_now')
  const press = (b: (typeof buttons)[number]) => (b.concern ? onConcern(b.concern as ConcernCode) : onLeaving())

  return (
    <div className="glass fixed inset-x-0 bottom-0 z-10 border-t border-line/70 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto max-w-md space-y-2">
        {help && (
          <Button variant="danger" size="lg" className="w-full" disabled={disabled} onClick={() => press(help)}>
            {text(help.linkId, role)}
          </Button>
        )}
        <div className="grid grid-cols-3 gap-2">
          {rest.map((b) => (
            <Button
              key={b.linkId}
              variant="secondary"
              disabled={disabled}
              onClick={() => press(b)}
              className="min-h-14 rounded-card px-2 text-sm leading-tight"
            >
              {text(b.linkId, role)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
