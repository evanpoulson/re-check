import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Buttons are the things you tap, so they are pills.
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-tap font-medium tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-brand-500 text-white hover:bg-brand-700',
        secondary: 'border border-brand-500 bg-surface text-brand-600 hover:bg-brand-50',
        danger: 'bg-level-red text-white hover:bg-[color-mix(in_srgb,var(--color-level-red),black_15%)]',
        ghost: 'text-brand-600 hover:underline underline-offset-4',
      },
      size: {
        md: 'min-h-11 px-5 text-lead',
        lg: 'min-h-14 px-6 text-lead',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(button({ variant, size }), className)} {...props} />
}
