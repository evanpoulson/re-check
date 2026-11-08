import { FlaskConical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/** "Synthetic data, demo thresholds". Shown in every staff screen's chrome. */
export function DemoBadge({ compact }: { compact?: boolean }) {
  const { t } = useTranslation()
  // Compact: the staff header shows only the flask on narrow screens; the text stays for screen readers and as a tooltip.
  return (
    <span
      title={compact ? t('demo.badge') : undefined}
      className={cn('demo-badge inline-flex shrink-0 items-center gap-1 rounded-full bg-level-overdue-bg px-2.5 py-0.5 text-xs font-semibold text-level-overdue', compact && 'is-compact')}
    >
      <FlaskConical aria-hidden className="size-3.5" />
      <span className="demo-badge-text">{t('demo.badge')}</span>
    </span>
  )
}
