import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** A white reading surface. Separated by a rule and space, with no shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-data border border-line bg-surface p-5', className)} {...props} />
}
