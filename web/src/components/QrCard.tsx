import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'

/** A QR card for one single-use link. The QR encodes the exact link the API returned. */
export function QrCard({ title, hint, link }: { title: string; hint: string; link: string }) {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-col items-center gap-4 p-8 text-center print:break-inside-avoid">
      <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
      <div className="rounded-card bg-surface p-3 ring-1 ring-line">
        <QRCodeSVG value={link} size={192} level="M" fgColor="#1d1d1f" role="img" aria-label={t('qr.label', { title })} />
      </div>
      <p className="max-w-xs text-[0.9375rem] text-muted">{hint}</p>
      <p className="max-w-full break-all text-xs text-muted no-print">{link}</p>
    </Card>
  )
}
