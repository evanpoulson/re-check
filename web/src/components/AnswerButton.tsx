import { Check } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * A full-width answer row. Selection is shown by a blue outline, a heavier
 * weight and a check mark, so it never relies on colour alone.
 *
 * `kind` sets what assistive tech hears: `radio` for one answer in a
 * `radiogroup`, `checkbox` for "choose all that apply" in a `group`, and
 * `button` for a plain choice that acts at once (such as who is answering).
 * Radio rows show an empty circle and checkbox rows an empty square before
 * anything is picked, so "tick all that apply" looks different from "pick one".
 */
export function AnswerButton({
  selected = false,
  kind = 'button',
  indicator = true,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean
  kind?: 'radio' | 'checkbox' | 'button'
  /** False for compact rows, such as the 0 to 10 scale, where the outline alone shows the choice. */
  indicator?: boolean
}) {
  const state = kind === 'button' ? { 'aria-pressed': selected } : { role: kind, 'aria-checked': selected }
  const shape = kind === 'checkbox' ? 'rounded-md' : 'rounded-full'
  const mark = indicator && (kind !== 'button' || selected)
  return (
    <button
      type="button"
      {...state}
      className={cn(
        'flex min-h-13 w-full items-center justify-between gap-3 rounded-card border bg-surface px-5 py-2.5 text-left text-title transition-[border-color,box-shadow,background-color]',
        selected
          ? 'border-brand-500 font-semibold shadow-[0_0_0_1px_var(--color-brand-500)]'
          : 'border-answer font-normal hover:border-muted',
        className,
      )}
      {...props}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
      {mark ? (
        selected ? (
          <span aria-hidden className={cn('flex size-7 shrink-0 items-center justify-center bg-brand-500 text-white', shape)}>
            <Check className="size-4" strokeWidth={3} />
          </span>
        ) : (
          <span aria-hidden className={cn('size-7 shrink-0 border-2 border-answer bg-surface', shape)} />
        )
      ) : null}
    </button>
  )
}
