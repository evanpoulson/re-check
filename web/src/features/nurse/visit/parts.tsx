import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The tab's heading for screen readers, with its lead as small helper text. The tab
 * already shows the page's name, so the heading isn't repeated on screen.
 */
export function PageHeading({ title, lead, aside }: { title: string; lead: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <div>
        <h2 className="sr-only">{title}</h2>
        <p className="text-small text-muted">{lead}</p>
      </div>
      {aside && <p className="text-small text-muted">{aside}</p>}
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
    <Card className={cn('min-w-0 space-y-4 p-4 sm:p-6', className)}>
      <div>
        <h3 className="text-title font-semibold">{title}</h3>
        {lead && <p className="mt-1 text-small text-muted">{lead}</p>}
      </div>
      {children}
    </Card>
  )
}

/** A labelled value: grey label above, the value in bold. */
export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="mt-1 font-semibold break-words">{value}</dd>
    </div>
  )
}

/**
 * A row of facts that wraps into columns. `rows` is for long labels such as check-in
 * questions: one fact per line, label beside its value, so values never drift out of line.
 */
export function Facts({ children, className, rows }: { children: ReactNode; className?: string; rows?: boolean }) {
  return (
    <dl
      className={cn(
        rows
          ? 'divide-y divide-line [&>div]:py-2.5 [&>div:first-child]:pt-0 [&>div:last-child]:pb-0 sm:[&>div]:grid sm:[&>div]:grid-cols-[minmax(0,1fr)_minmax(0,40%)] sm:[&>div]:gap-x-6 sm:[&_dd]:mt-0'
          : 'grid grid-cols-2 items-start gap-x-6 gap-y-4 sm:grid-cols-3',
        className,
      )}
    >
      {children}
    </dl>
  )
}

export const Divider = () => <hr className="border-line" />

/**
 * A quiet note. Info is outlined and neutral is grey; neither is blue (blue means "press
 * me") nor a colour that reads as "all clear".
 */
export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'neutral' }) {
  return (
    <div className={cn('space-y-1 rounded-data p-4 text-small', tone === 'info' ? 'border border-line bg-surface' : 'bg-canvas')}>
      {children}
    </div>
  )
}

/** The one safety reminder about the two clocks, worded and styled the same on every tab. */
export function Safeguard() {
  const { t } = useTranslation()
  return (
    <p className="flex items-start gap-2 rounded-data border border-line p-3 text-small">
      <ShieldCheck aria-hidden className="mt-[0.15em] size-[1.2em] shrink-0 text-muted" />
      {t('visitPage.safeguard')}
    </p>
  )
}
