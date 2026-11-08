import { Check, ChevronRight } from 'lucide-react'
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A full-width answer row. A radio or checkbox mark on the left shows the
 * choice by shape as well as colour, and the label keeps its weight, so
 * nothing moves when it is picked.
 *
 * `kind` sets what assistive tech hears: `radio` for one answer in a
 * `radiogroup`, `checkbox` for "choose all that apply" in a `group`, and
 * `button` for a plain choice that acts at once (such as who is answering),
 * which shows a chevron instead of a mark.
 */
export function AnswerButton({
  selected = false,
  kind = 'button',
  hint,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean
  kind?: 'radio' | 'checkbox' | 'button'
  /** A second, quieter line under the label. */
  hint?: ReactNode
}) {
  const hintId = useId()
  const state = kind === 'button' ? { 'aria-pressed': selected } : { role: kind, 'aria-checked': selected }
  return (
    <button type="button" {...state} aria-describedby={hint ? hintId : undefined} className={cn('choice', selected && 'is-selected', className)} {...props}>
      {kind !== 'button' && (
        <span aria-hidden className={cn('choice-mark', kind)}>
          {kind === 'checkbox' && selected && <Check className="size-4" strokeWidth={3} />}
        </span>
      )}
      <span className="choice-body">
        {children}
        {/* Read as the description, not as part of the button's name. */}
        {hint && <span id={hintId} aria-hidden className="choice-hint">{hint}</span>}
      </span>
      {kind === 'button' && <ChevronRight aria-hidden className="chev size-5 rtl:rotate-180" />}
    </button>
  )
}
