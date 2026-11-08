import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const buttons = alwaysVisible()
  return (
    <section aria-label={t('patient.contactStaff')} className="patient-dock">
      <div className="patient-dock-inner">
        {buttons.map((button) => {
          const urgent = button.concern === 'help_now' || button.concern === 'worried'
          return (
            <button
              type="button"
              key={button.linkId}
              className={button.concern === 'help_now' ? 'patient-help' : 'patient-help-secondary'}
              disabled={!urgent && disabled}
              onClick={() => button.concern ? onConcern(button.concern as ConcernCode) : onLeaving()}
            >
              {button.concern === 'help_now' && <CircleAlert size={18} aria-hidden />}
              {text(button.linkId, role)}
            </button>
          )
        })}
      </div>
    </section>
  )
}
