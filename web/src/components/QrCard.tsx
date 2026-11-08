import { Check, Copy } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'

/**
 * A QR card for the visit's link. The QR encodes the exact link the API returned,
 * with a 4-module quiet zone so it scans when printed or saved. `svgId` lets the
 * page save the same image.
 */
export function QrCard({
  title,
  hint,
  link,
  heading: Heading = 'h3',
  svgId,
}: {
  title: string
  hint: string
  link: string
  heading?: 'h2' | 'h3'
  svgId?: string
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Card className="flex flex-col items-center gap-4 p-8 text-center print:break-inside-avoid">
      <Heading className="text-2xl font-semibold tracking-tight">{title}</Heading>
      <div className="overflow-hidden rounded-card ring-1 ring-line">
        <QRCodeSVG id={svgId} value={link} size={216} marginSize={4} level="M" fgColor="#1d1d1f" role="img" aria-label={t('qr.label', { title })} />
      </div>
      <p className="max-w-xs text-[0.9375rem] text-muted">{hint}</p>
      <div className="flex w-full min-w-0 items-center gap-2 rounded-xl bg-canvas py-1 pr-1 pl-3 no-print">
        <span className="min-w-0 flex-1 truncate text-start text-xs text-muted" title={link}>{link}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-tap px-3 text-sm font-medium text-brand-600 hover:bg-brand-50"
        >
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          <span aria-live="polite">{copied ? t('qr.copied') : t('qr.copy')}</span>
        </button>
      </div>
    </Card>
  )
}
