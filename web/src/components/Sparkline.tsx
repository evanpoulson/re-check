import { useTranslation } from 'react-i18next'
import type { TrendPoint } from '@/api/types'

/**
 * Pain trend, 0 to 10. A check-in with no pain answer is a GAP in the line,
 * never a zero.
 */
export function Sparkline({ trend, width = 96, height = 28 }: { trend: TrendPoint[]; width?: number; height?: number }) {
  const { t } = useTranslation()
  const answered = trend.filter((p) => p.pain !== null)
  // No pain answers: a dash, with the reason as a tooltip and for screen readers.
  if (answered.length === 0) {
    return (
      <span className="text-muted" title={t('sparkline.none')}>
        <span aria-hidden>—</span>
        <span className="sr-only">{t('sparkline.none')}</span>
      </span>
    )
  }
  // One answer: a dot and the number, not a lone point on an empty line.
  if (answered.length === 1) {
    return (
      <span className="inline-flex items-center gap-1.5" aria-label={t('sparkline.label', { values: answered[0]!.pain })} role="img">
        <span aria-hidden className="size-2 rounded-full bg-brand-500" />
        <span aria-hidden className="tabular font-semibold">{answered[0]!.pain}</span>
      </span>
    )
  }
  const pad = 3
  const step = trend.length > 1 ? (width - pad * 2) / (trend.length - 1) : 0
  const y = (v: number) => height - pad - (v / 10) * (height - pad * 2)

  const segments: string[] = []
  let current: string[] = []
  trend.forEach((p, i) => {
    if (p.pain === null) {
      if (current.length > 1) segments.push(current.join(' '))
      current = []
      return
    }
    current.push(`${pad + i * step},${y(p.pain)}`)
  })
  if (current.length > 1) segments.push(current.join(' '))

  const label = t('sparkline.label', { values: answered.map((p) => p.pain).join(', ') })

  return (
    <svg role="img" aria-label={label} width={width} height={height} className="text-brand-500">
      {segments.map((pts) => (
        <polyline key={pts} points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      ))}
      {trend.map((p, i) =>
        p.pain === null ? (
          <line key={i} x1={pad + i * step} x2={pad + i * step} y1={height - 8} y2={height - 3} stroke="var(--color-muted)" strokeWidth="2" strokeDasharray="1 2" />
        ) : (
          <circle key={i} cx={pad + i * step} cy={y(p.pain)} r="2.5" fill="currentColor" />
        ),
      )}
    </svg>
  )
}
