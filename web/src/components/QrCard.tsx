import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'

/** A QR card for the visit's link. The QR encodes the exact link the API returned. */
export function QrCard({ title, hint, link, enrolment = false }: {
  title: string
  hint: string
  link: string
  enrolment?: boolean
}) {
  const { t } = useTranslation()
  const Heading = enrolment ? 'h2' : 'h3'
  return (
    <Card className="flex flex-col items-center gap-4 p-4 text-center sm:p-8 print:break-inside-avoid">
      <Heading className="text-2xl font-semibold tracking-tight">{title}</Heading>
      <div className="max-w-full rounded-card bg-surface p-3 ring-1 ring-line">
        <QRCodeSVG value={link} size={192} level="M" fgColor="#1d1d1f" role="img"
          className="h-auto max-w-full" aria-label={t('qr.label', { title })} />
      </div>
      <p className="max-w-xs text-[0.9375rem] text-muted">{hint}</p>
      {enrolment ? (
        <details className="no-print max-w-full text-sm text-muted">
          <summary className="min-h-11 cursor-pointer py-3 text-brand-700 underline">{t('enrol.showLink')}</summary>
          <p className="wrap-anywhere" dir="ltr">{link}</p>
        </details>
      ) : <p className="max-w-full break-all text-xs text-muted no-print">{link}</p>}
    </Card>
  )
}
