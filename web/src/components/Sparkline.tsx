import { useTranslation } from 'react-i18next'
import type { TrendPoint } from '@/api/types'

/**
 * Pain trend, 0 to 10. A check-in with no pain answer is a GAP in the line,
 * never a zero.
 */
export function Sparkline({ trend, width = 96, height = 28 }: { trend: TrendPoint[]; width?: number; height?: number }) {
  const { t } = useTranslation()
  if (trend.length === 0) return <span className="text-muted">{t('common.none')}</span>
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

  const answered = trend.filter((p) => p.pain !== null)
  const label = answered.length
    ? t('sparkline.label', { values: answered.map((p) => p.pain).join(', ') })
    : t('sparkline.none')

  return (
    <svg role="img" aria-label={label} width={width} height={height} className="text-brand-600">
      {segments.map((pts) => (
        <polyline key={pts} points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      ))}
      {trend.map((p, i) =>
        p.pain === null ? (
          <line key={i} x1={pad + i * step} x2={pad + i * step} y1={height - 8} y2={height - 3} stroke="#94a3b8" strokeWidth="2" strokeDasharray="1 2" />
        ) : (
          <circle key={i} cx={pad + i * step} cy={y(p.pain)} r="2.5" fill="currentColor" />
        ),
      )}
    </svg>
  )
}
