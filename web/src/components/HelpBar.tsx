import { ChevronDown, ChevronUp, CircleAlert } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { alwaysVisible, text } from '@/api/bank'
import type { ConcernCode, Role } from '@/api/types'

interface Props {
  role: Role
  onConcern: (c: ConcernCode) => void
  onLeaving: () => void
  disabled?: boolean
  /** Show only "I need help now", for example while the circle check plays. */
  helpOnly?: boolean
}

/**
 * Large text or a very small screen: fewer than about 19.5 rem across or 30 rem
 * tall. The three quieter buttons then fold behind "More options" so the dock
 * never covers most of the question. "I need help now" always stays visible.
 */
function isCompact() {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return window.innerWidth / rem < 19.5 || window.innerHeight / rem < 30
}

/**
 * The four always-visible buttons from the question bank, docked to the bottom
 * of every patient screen. "I need help now" leads, full width; the other three
 * sit in one quieter row below it. Wording (and companion wording) comes from the
 * bank. "Question about my wait or care" is non-clinical and goes to the triage
 * nurse, not a physician.
 */
export function HelpBar({ role, onConcern, onLeaving, disabled, helpOnly }: Props) {
  const { t } = useTranslation()
  const buttons = alwaysVisible()
  const help = buttons.find((b) => b.concern === 'help_now')
  const others = buttons.filter((b) => b !== help)
  const dock = useRef<HTMLElement>(null)
  const moreId = useId()
  const [compact, setCompact] = useState(false)
  const [open, setOpen] = useState(false)
  // Publish the dock's real height so the page pads and scrolls focus clear of it,
  // even at 200% text or with longer translated labels. A change of text size
  // resizes the dock, so the same observer re-checks the compact layout.
  useLayoutEffect(() => {
    const el = dock.current
    if (!el) return
    const root = document.documentElement
    const update = () => {
      root.style.setProperty('--dock-h', `${el.offsetHeight}px`)
      setCompact(isCompact())
    }
    update()
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
      root.style.removeProperty('--dock-h')
    }
  }, [])

  const showOthers = !helpOnly && (!compact || open)
  return (
    <section ref={dock} aria-label={t('patient.contactStaff')} className={`patient-dock ${compact ? 'is-compact' : ''}`}>
      <div className="patient-dock-inner">
        {help && (
          <button type="button" className="patient-help" onClick={() => onConcern('help_now')}>
            <CircleAlert size={20} aria-hidden className="shrink-0" />
            {text(help.linkId, role)}
          </button>
        )}
        {compact && !helpOnly && (
          <button type="button" className="patient-help-more" aria-expanded={open} aria-controls={moreId} onClick={() => setOpen(!open)}>
            {t('patient.moreOptions')}
            {open ? <ChevronDown aria-hidden size={18} className="shrink-0" /> : <ChevronUp aria-hidden size={18} className="shrink-0" />}
          </button>
        )}
        {showOthers && (
          <div id={moreId} className="patient-dock-more">
            {others.map((button) => (
              <button
                type="button"
                key={button.linkId}
                className="patient-help-secondary"
                disabled={button.concern !== 'worried' && disabled}
                onClick={() => (button.concern ? onConcern(button.concern as ConcernCode) : onLeaving())}
              >
                {text(button.linkId, role)}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
