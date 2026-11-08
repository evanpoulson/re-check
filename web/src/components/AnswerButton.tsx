import { Check } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * A full-width answer row. Selection is shown by a blue outline, a heavier
 * weight and a check mark, so it never relies on colour alone.
 */
export function AnswerButton({
  selected = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex min-h-14 w-full items-center justify-between gap-3 rounded-card border bg-surface px-5 py-3 text-left text-xl transition-[border-color,box-shadow,background-color]',
        selected
          ? 'border-brand-500 font-semibold shadow-[0_0_0_1px_var(--color-brand-500)]'
          : 'border-line font-normal hover:border-muted',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {selected ? (
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
          <Check className="size-4" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  )
}
