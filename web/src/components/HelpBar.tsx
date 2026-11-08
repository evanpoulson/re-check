import { useTranslation } from 'react-i18next'
import type { ConcernCode } from '@/api/types'
import { Button } from '@/components/ui/button'

/** Pinned to every patient screen so an urgent report is never more than one tap away. */
export function HelpBar({ onConcern, disabled }: { onConcern: (c: ConcernCode) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface p-3 shadow-[0_-4px_12px_rgba(15,23,42,0.08)]">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
        <Button variant="secondary" size="lg" disabled={disabled} onClick={() => onConcern('worried')}>
          {t('help.worried')}
        </Button>
        <Button variant="danger" size="lg" disabled={disabled} onClick={() => onConcern('help_now')}>
          {t('help.now')}
        </Button>
      </div>
    </div>
  )
}
