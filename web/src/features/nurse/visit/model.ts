import type { TFunction } from 'i18next'
import { useOutletContext } from 'react-router'
import { optionLabel } from '@/api/bank'
import type { CheckinReport, PatientReport, StaffRole, TaskLevel, TimelineEntry, VisitDetail } from '@/api/types'
import { choiceText, concernText, findingsText } from '@/lib/answers'

/** What every visit page gets from the visit layout. */
export interface VisitContext {
  detail: VisitDetail
  /** The last refresh failed: the page shows what it has, but actions are off. */
  stale: boolean
  role: StaffRole | null
  isNurse: boolean
  /** The open task is routed to this role. */
  canAct: boolean
  /** May press Acknowledge: a routed role, or the triage nurse confirming they have seen the report. */
  canAcknowledge: boolean
  now: number
  /** Called when an assessment completes, so the layout can move focus to the result. */
  onComplete: () => void
}

export const useVisit = () => useOutletContext<VisitContext>()

/** Tinted background and text for each task level. Colour always comes with text. */
export const LEVEL_TONE: Record<TaskLevel, string> = {
  red: 'border-level-red bg-level-red-bg text-level-red',
  amber: 'border-level-amber bg-level-amber-bg text-level-amber',
  silent: 'border-level-silent bg-level-silent-bg text-level-silent',
  leave_risk: 'border-level-leave bg-level-leave-bg text-level-leave',
  overdue: 'border-level-overdue bg-level-overdue-bg text-level-overdue',
}

export type ReportEntry = Extract<TimelineEntry, { report_id: string }>
export type CheckinEntry = ReportEntry & { report: CheckinReport }

export const isReport = (e: TimelineEntry): e is ReportEntry => 'report_id' in e
export const isCheckin = (e: TimelineEntry): e is CheckinEntry => isReport(e) && e.report.kind === 'checkin'

/** When an entry happened, whatever its kind. */
export function entryTime(e: TimelineEntry): string {
  if ('received_at' in e) return e.received_at
  return 'started_at' in e ? e.started_at : e.at
}

/** One line on what a patient or companion report said. */
export function reportSummary(report: PatientReport, t: TFunction): string {
  switch (report.kind) {
    case 'checkin':
      return report.new_findings.kind === 'answered' && report.new_findings.value.length
        ? findingsText(report.new_findings, t)
        : choiceText(report.feeling_change, 'feeling_change', t)
    case 'concern':
      return concernText(report.concern)
    case 'finding':
      return report.findings.map((f) => optionLabel('new_findings', f)).join(', ')
    default:
      return t('timeline.leaving', { who: t(`reporter.${report.reporter}`) })
  }
}

export const reasonText = (code: string, t: TFunction) =>
  t(`reason.${code}`, { defaultValue: code.replaceAll('_', ' ') })
