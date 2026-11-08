import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** A white reading surface on the grey canvas: large radius, a soft shadow and no border. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card bg-surface p-6 shadow-card', className)} {...props} />
}
