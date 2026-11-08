import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white hover:bg-brand-700',
        secondary: 'border border-line bg-surface text-ink hover:bg-slate-50',
        danger: 'bg-level-red text-white hover:bg-red-900',
        ghost: 'text-brand-700 hover:bg-brand-50',
      },
      size: {
        md: 'min-h-11 px-4 text-base',
        lg: 'min-h-14 px-5 text-xl',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(button({ variant, size }), className)} {...props} />
}
