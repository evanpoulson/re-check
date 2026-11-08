import type { TFunction } from 'i18next'
import { optionLabel } from '@/api/bank'
import { entryKind, type TimelineEntry } from '@/api/types'
import { attentionText, choiceText, concernText, findingsText, painText } from '@/lib/answers'
import { clock } from '@/lib/time'

/** One line describing a timeline entry. Corrections are new entries, so nothing is rewritten. */
export function describeEntry(e: TimelineEntry, t: TFunction): string {
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
    case 'session': {
      const s = e as Extract<TimelineEntry, { session_id: string; started_at: string }>
      const signedIn = t(s.replaces ? 'timeline.signedInTakeover' : 'timeline.signedIn', { who: t(`reporter.${s.role}`) })
      if (!s.ended_at || !s.end_reason) return signedIn
      return `${signedIn}. ${t('timeline.signedOut', { time: clock(s.ended_at), reason: t(`sessionEnd.${s.end_reason}`) })}`
    }
    default: {
      const ev = e as Extract<TimelineEntry, { event: string }>
      return t('timeline.task', { event: t(`taskEvent.${ev.event}`), level: t(`level.${ev.level}`) })
    }
  }
}
