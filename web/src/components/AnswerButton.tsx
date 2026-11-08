import { Check } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** A large answer choice. `selected` is exposed to assistive tech, not just colour. */
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
        'flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border-2 px-4 text-left text-xl font-medium transition-colors',
        selected ? 'border-brand-600 bg-brand-50' : 'border-line bg-surface hover:bg-slate-50',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {selected ? <Check aria-hidden className="size-6 text-brand-700" /> : null}
    </button>
  )
}
