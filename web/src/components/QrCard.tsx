import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'

/** A QR card for one single-use link. The QR encodes the exact link the API returned. */
export function QrCard({ title, hint, link }: { title: string; hint: string; link: string }) {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-col items-center gap-3 text-center print:break-inside-avoid">
      <h3 className="text-lg font-semibold">{title}</h3>
      <QRCodeSVG value={link} size={176} level="M" role="img" aria-label={t('qr.label', { title })} />
      <p className="text-muted">{hint}</p>
      <p className="max-w-full break-all text-xs text-muted no-print">{link}</p>
    </Card>
  )
}
