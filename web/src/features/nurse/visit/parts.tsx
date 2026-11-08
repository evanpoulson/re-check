import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function PageHeading({ title, lead, aside }: { title: string; lead: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        <h2 className="text-[1.75rem] leading-tight font-semibold">{title}</h2>
        <p className="mt-1 text-muted">{lead}</p>
      </div>
      {aside && <p className="text-[0.9375rem] text-muted">{aside}</p>}
    </div>
  )
}

/** A white card with a section title, an optional grey lead and its content. */
export function SectionCard({ title, lead, className, children }: {
  title: string
  lead?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn('min-w-0 space-y-4', className)}>
      <div>
        <h3 className="text-[1.375rem] leading-snug font-semibold">{title}</h3>
        {lead && <p className="mt-1 text-[0.9375rem] text-muted">{lead}</p>}
      </div>
      {children}
    </Card>
  )
}

/** A labelled value: grey label above, the value in bold. */
export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-semibold break-words">{value}</dd>
    </div>
  )
}

/** A row of facts that wraps into columns. */
export function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3', className)}>{children}</dl>
}

export const Divider = () => <hr className="border-line" />

/** A quiet tinted note. Never a colour that reads as "all clear". */
export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'neutral' }) {
  return (
    <div className={cn('space-y-1 rounded-data p-4 text-[0.9375rem]', tone === 'info' ? 'bg-brand-50' : 'bg-canvas')}>
      {children}
    </div>
  )
}
