import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Buttons are the things you tap, so they carry the large radius.
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-tap font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-white hover:bg-[#0a1827]',
        secondary: 'border-2 border-ink bg-surface text-ink hover:bg-brand-50',
        danger: 'bg-level-red text-white hover:bg-[#85140f]',
        ghost: 'text-brand-700 underline-offset-4 hover:bg-brand-50 hover:underline',
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
