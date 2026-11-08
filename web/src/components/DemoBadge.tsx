import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/** "Synthetic data, demo thresholds". Shown in every staff screen's chrome: a dashed, squared label, so it never looks like a status chip. */
export function DemoBadge({ compact }: { compact?: boolean }) {
  const { t } = useTranslation()
  // Compact: the staff header shows only the flask on narrow screens; the text stays for screen readers and as a tooltip.
  return (
    <span
      title={compact ? t('demo.badge') : undefined}
      className={cn('demo-badge inline-flex shrink-0 items-center gap-1 rounded-data border border-dashed border-answer px-2 py-0.5 text-note font-medium text-muted', compact && 'is-compact')}
    >
      <FlaskConical aria-hidden className="size-[1.15em] shrink-0" />
      <span className="demo-badge-text">{t('demo.badge')}</span>
    </span>
  )
}
