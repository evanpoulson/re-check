// Friendly aliases over the generated backend contract. Nothing here is
// hand-written data shape: every type comes from contract.d.ts.
import type {
  CheckinReport,
  Task,
  TaskEvent,
  VisitDetail,
  VitalsRecord,
  FlagRecord,
  ReportRecord,
} from './contract'

export type * from './contract'

export type ItemAnswer = NonNullable<CheckinReport['items']>[string]
export type TimelineEntry = VisitDetail['timeline'][number]
export type Report = ReportRecord['report']
export type Role = 'patient' | 'companion'

export type EntryKind = 'report' | 'vitals' | 'flag' | 'task_event' | 'session'

/** The `type` field is optional in the generated types, so detect by identity field. */
export function entryKind(e: TimelineEntry): EntryKind {
  if ('report_id' in e) return 'report'
  if ('vitals_id' in e) return 'vitals'
  if ('flag_id' in e) return 'flag'
  if ('session_id' in e) return 'session'
  return 'task_event'
}

export type { Task, TaskEvent, VitalsRecord, FlagRecord, ReportRecord }
