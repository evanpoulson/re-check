import type { TFunction } from 'i18next'
import { useOutletContext } from 'react-router'
import { optionLabel } from '@/api/bank'
import type { CheckinReport, PatientReport, StaffRole, Task, TaskEvent, TimelineEntry, VisitDetail } from '@/api/types'
import { choiceText, concernText, findingsText } from '@/lib/answers'

/** What every visit page gets from the visit layout. */
export interface VisitContext {
  detail: VisitDetail
  /** The last refresh failed: the page shows what it has, but actions are off. */
  stale: boolean
  role: StaffRole | null
  /** Desk roles (triage and charge nurse): vitals and visit management, as the API's DeskStaff allows. */
  isDesk: boolean
  /** Flag higher is the triage nurse's alone (the API's flag route). */
  canFlag: boolean
  /** The open task is routed to this role. */
  canAct: boolean
  /** May press Acknowledge: a routed role, or a desk nurse confirming they have seen the report. */
  canAcknowledge: boolean
  now: number
  /** The assessment this page just recorded, with its outcome, until the page is left. */
  completed: Task | null
  /** Called when an assessment completes, so the layout can move focus to the result. */
  onComplete: (task: Task) => void
}

export const useVisit = () => useOutletContext<VisitContext>()

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

/** Role names inside a sentence: "physician and charge nurse", or "physician or charge nurse". */
export const rolesText = (roles: readonly StaffRole[], t: TFunction, type: 'conjunction' | 'disjunction' = 'conjunction') =>
  new Intl.ListFormat('en', { type }).format(roles.map((r) => t(`role.${r}`).toLocaleLowerCase()))

/** The most recent "assessed" event on this visit, if any. */
export const lastAssessed = (detail: VisitDetail): TaskEvent | undefined =>
  detail.timeline.filter((e): e is TaskEvent => 'event' in e && e.event === 'assessed').at(-1)

/** The newest patient or companion report of any kind. */
export const lastReport = (detail: VisitDetail): ReportEntry | undefined => detail.timeline.filter(isReport).at(-1)
