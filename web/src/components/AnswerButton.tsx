import { Check } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * A full-width answer bar. Selection is shown by a thick left edge, a heavier
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
        'flex min-h-14 w-full items-center justify-between gap-3 rounded-tap border border-l-[10px] px-4 py-2 text-left text-xl transition-colors',
        selected ? 'border-brand-600 bg-brand-50 font-extrabold' : 'border-line border-l-line bg-surface font-medium hover:bg-brand-50',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {selected ? <Check aria-hidden className="size-6 shrink-0 text-brand-700" /> : null}
    </button>
  )
}
