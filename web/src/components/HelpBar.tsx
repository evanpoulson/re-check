import { CircleAlert } from 'lucide-react'
import { alwaysVisible, text } from '@/api/bank'
import type { ConcernCode, Role } from '@/api/types'

interface Props {
  role: Role
  onConcern: (c: ConcernCode) => void
  onLeaving: () => void
  disabled?: boolean
}

/**
 * The four always-visible buttons from the question bank, docked to the bottom
 * of every patient screen. Urgent help leads; other concerns stay quieter. Wording (and companion wording) comes from the bank. "Question about my
 * wait or care" is non-clinical and goes to the triage nurse, not a physician.
 */
export function HelpBar({ role, onConcern, onLeaving, disabled }: Props) {
  const buttons = alwaysVisible()
  const help = buttons.find((b) => b.concern === 'help_now')
  const rest = buttons.filter((b) => b.concern !== 'help_now')
  const press = (b: (typeof buttons)[number]) => (b.concern ? onConcern(b.concern as ConcernCode) : onLeaving())

  return (
    <section aria-label="Contact staff" className="patient-dock">
      <div className="patient-dock-inner">
        {help && (
          <button type="button" className="patient-help" disabled={disabled} onClick={() => press(help)}>
            <CircleAlert size={20} aria-hidden />
            {text(help.linkId, role)}
          </button>
        )}
        <div className="patient-other-help">
          {rest.map((b) => (
            <button type="button" key={b.linkId} disabled={disabled} onClick={() => press(b)}>
              {text(b.linkId, role)}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
