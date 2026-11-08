import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { optionLabel } from '@/api/bank'
import { entryKind, type TimelineEntry } from '@/api/types'
import { attentionText, choiceText, concernText, findingsText, painText } from '@/lib/answers'
import { clock } from '@/lib/time'

function stamp(e: TimelineEntry): string {
  return 'received_at' in e ? e.received_at : e.at
}

/** Oldest first. Each entry shows what happened and when; corrections are new entries. */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const { t } = useTranslation()
  if (entries.length === 0) return <p className="text-muted">{t('timeline.empty')}</p>
  return (
    <ol className="relative space-y-4 pl-6 before:absolute before:inset-y-1.5 before:left-[5px] before:w-px before:bg-line">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span aria-hidden className="absolute -left-6 top-1.5 size-[11px] rounded-full border-2 border-surface bg-brand-500 ring-1 ring-line" />
          <div className="tabular text-xs font-medium text-muted">{clock(stamp(e))}</div>
          <div className="text-[0.9375rem]">{describe(e, t)}</div>
        </li>
      ))}
    </ol>
  )
}

function describe(e: TimelineEntry, t: TFunction): string {
  switch (entryKind(e)) {
    case 'report': {
      const r = (e as Extract<TimelineEntry, { report_id: string }>).report
      const who = t(`reporter.${r.reporter}`)
      if (r.kind === 'checkin') {
        return t('timeline.checkin', {
          who,
          change: choiceText(r.feeling_change, 'feeling_change', t),
          now: choiceText(r.feeling_now, 'feeling_now', t),
          pain: painText(r.pain, t),
          found: findingsText(r.new_findings, t),
          attention: attentionText(r.attention, t),
        })
      }
      if (r.kind === 'concern') return t('timeline.concern', { who, concern: concernText(r.concern) })
      if (r.kind === 'finding') return t('timeline.finding', { who, findings: r.findings.map((f) => optionLabel('new_findings', f)).join(', ') })
      return t('timeline.leaving', { who })
    }
    case 'vitals': {
      const v = e as Extract<TimelineEntry, { vitals_id: string }>
      const parts = [
        v.sbp !== null && v.dbp !== null ? `BP ${v.sbp}/${v.dbp}` : null,
        v.hr !== null ? `HR ${v.hr}` : null,
        v.rr !== null ? `RR ${v.rr}` : null,
        v.spo2 !== null ? `SpO2 ${v.spo2}%` : null,
        v.temp_c !== null ? `${v.temp_c} °C` : null,
      ].filter(Boolean)
      return t('timeline.vitals', { values: parts.join(', '), role: t(`role.${v.entered_by.role}`) })
    }
    case 'flag': {
      const f = e as Extract<TimelineEntry, { flag_id: string }>
      return f.note ? t('timeline.flagNote', { note: f.note }) : t('timeline.flag')
    }
    default: {
      const ev = e as Extract<TimelineEntry, { event: string }>
      return t('timeline.task', { event: t(`taskEvent.${ev.event}`), level: t(`level.${ev.level}`) })
    }
  }
}
