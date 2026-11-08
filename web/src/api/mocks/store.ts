// In-memory stand-in for the backend, typed by the generated contract so it
// cannot drift from it. State is saved to localStorage so a nurse tab and a
// patient tab on the same origin see the same visits. This is demo logic, not
// the real rules engine: thresholds here are demo values.
import type {
  BoardRow,
  Disposition,
  FlagRecord,
  PatientHome,
  PatientReport,
  QuestionItem,
  ReportReceipt,
  ReportRecord,
  SessionInfo,
  StaffRef,
  Task,
  TaskEvent,
  TaskLevel,
  TimelineEntry,
  TrendPoint,
  TriageBoard,
  VisitCreate,
  VisitDetail,
  VisitEnrolled,
  VisitSummary,
  VitalsCreate,
  VitalsRecord,
  Worklist,
  WorklistRow,
} from '../types'

export class MockError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface Rec {
  visit: VisitSummary
  patientToken: string
  companionToken: string
  patientTokenUsed: boolean
  companionTokenUsed: boolean
  reports: ReportRecord[]
  vitals: VitalsRecord[]
  flags: FlagRecord[]
  task: Task | null
  done: Task[]
  events: TaskEvent[]
}
interface State {
  visits: Rec[]
  submissions: Record<string, { fingerprint: string; receipt: ReportReceipt }>
}
interface Session {
  visitId: string
  role: 'patient' | 'companion'
}

const KEY = 'recheck-mock-state-v1'
const SESSION_KEY = 'recheck-mock-session-v1'
export const NURSE: StaffRef = { user_id: 'demo-nurse', role: 'triage_nurse' }
const LEVELS: TaskLevel[] = ['overdue', 'leave_risk', 'silent', 'amber', 'red']
const MIN = 60_000
const INTERVAL_MIN: Record<number, number> = { 2: 15, 3: 30, 4: 60, 5: 120 }
const intervalOf = (ctas: number) => INTERVAL_MIN[ctas] ?? 60

let memory: string | null = null
let memorySession: Session | null = null

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY) ?? memory
  } catch {
    return memory
  }
}
const write = (v: string) => {
  memory = v
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* memory only */
  }
}

const iso = (ms: number) => new Date(ms).toISOString()
const uuid = () => crypto.randomUUID()
const randomToken = () => {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}
const origin = () => (typeof location === 'undefined' ? 'http://localhost' : location.origin)

export function resetMockState() {
  memory = null
  memorySession = null
  try {
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

// Question bank (demo). Overall, pain and findings are fixed fields of the
// check-in; these are the complaint-specific items.
export const BANK: Record<VisitSummary['complaint_group'], QuestionItem[]> = {
  chest_back_pain: [
    { key: 'pain_change', input_type: 'yes_no', text: 'Has the pain changed since you were first seen?' },
    { key: 'pain_spread', input_type: 'yes_no', text: 'Has the pain moved or spread somewhere new?' },
    {
      key: 'pain_location',
      input_type: 'choice',
      text: 'Where is the new pain?',
      options: [
        { code: 'arm', text: 'Arm or shoulder' },
        { code: 'jaw_neck', text: 'Jaw or neck' },
        { code: 'back', text: 'Back' },
        { code: 'belly', text: 'Belly' },
      ],
    },
  ],
  neuro_change: [
    { key: 'speech_different', input_type: 'yes_no', text: 'Is their speech different from usual?' },
    {
      key: 'last_known_well',
      input_type: 'choice',
      text: 'When were they last speaking and acting as usual?',
      options: [
        { code: 'within_hour', text: 'Within the last hour' },
        { code: 'few_hours', text: 'A few hours ago' },
        { code: 'unknown', text: 'I do not know' },
      ],
    },
  ],
  head_injury: [
    { key: 'headache_worse', input_type: 'yes_no', text: 'Is the headache getting worse?' },
    { key: 'drowsier', input_type: 'yes_no', text: 'Are they harder to wake or more confused than before?' },
  ],
  general: [{ key: 'new_symptom', input_type: 'yes_no', text: 'Is there a new symptom since you were first seen?' }],
}

// Follow-up items asked after an urgent finding has been routed. They can name
// items outside the visit's own complaint group (a companion reporting speech
// change on a general visit), so they are looked up across the whole bank.
const FOLLOW_UP: Partial<Record<string, string[]>> = {
  chest_pain: ['pain_location'],
  speech_change: ['last_known_well'],
  facial_droop: ['last_known_well'],
  new_weakness_numbness: ['last_known_well'],
}
export const allItems = (): QuestionItem[] => Object.values(BANK).flat()
export const itemByKey = (key: string) => allItems().find((i) => i.key === key)

function seed(now: number): State {
  const mk = (
    ctas: number,
    group: VisitSummary['complaint_group'],
    triagedMinAgo: number,
    ref: string,
    promptDueMin: number,
    reassessDueMin: number,
  ): Rec => ({
    visit: {
      visit_id: uuid(),
      site_id: 'demo-site',
      ctas,
      complaint_group: group,
      cedis_code: null,
      language: 'en',
      channel: 'phone',
      pager_no: null,
      status: 'waiting',
      triaged_at: iso(now - triagedMinAgo * MIN),
      closed_at: null,
      next_prompt_due_at: iso(now + promptDueMin * MIN),
      staff_reassess_due_at: iso(now + reassessDueMin * MIN),
      last_staff_check_at: iso(now - triagedMinAgo * MIN),
    },
    patientToken: `demo-patient-${ref}-token`,
    companionToken: `demo-companion-${ref}-token`,
    patientTokenUsed: false,
    companionTokenUsed: false,
    reports: [],
    vitals: [],
    flags: [],
    task: null,
    done: [],
    events: [],
  })

  const chest = mk(2, 'chest_back_pain', 42, 'chest', 12, 3)
  const calm = mk(3, 'general', 55, 'general', 9, 20)
  const head = mk(3, 'head_injury', 70, 'head', -20, 5)

  const addCheckin = (r: Rec, minAgo: number, overall: 'better' | 'same' | 'worse', pain: number, findings: string[]) => {
    const id = uuid()
    const report: PatientReport = {
      kind: 'checkin',
      submission_id: id,
      reporter: 'patient',
      channel: 'phone',
      captured_at: iso(now - minAgo * MIN),
      questionnaire_version: '2026-11-07.demo',
      overall: { kind: 'answered', value: overall },
      pain: { kind: 'answered', value: pain },
      new_findings: { kind: 'answered', value: findings as never },
      items: {},
    }
    r.reports.push({ type: 'report', report_id: id, visit_id: r.visit.visit_id, received_at: iso(now - minAgo * MIN), report })
    return id
  }

  addCheckin(chest, 25, 'same', 5, [])
  const worse = addCheckin(chest, 3, 'worse', 8, ['chest_pain'])
  addCheckin(calm, 40, 'better', 3, [])
  addCheckin(calm, 20, 'same', 2, [])
  const first = addCheckin(head, 62, 'same', 3, [])

  raise(chest, 'red', 'finding_chest_pain', 'report', worse, now - 3 * MIN)
  raise(head, 'silent', 'missed_checkin', 'report', first, now - 5 * MIN)

  return { visits: [chest, calm, head], submissions: {} }
}

function load(): State {
  const raw = read()
  if (raw) return JSON.parse(raw) as State
  const s = seed(Date.now())
  write(JSON.stringify(s))
  return s
}
const save = (s: State) => write(JSON.stringify(s))

function notify(visitId: string, type: 'report.received' | 'task.changed' | 'vitals.recorded' | 'visit.changed', taskId?: string) {
  if (typeof BroadcastChannel === 'undefined') return
  const ch = new BroadcastChannel('recheck-events')
  ch.postMessage({ event_id: uuid(), type, at: iso(Date.now()), visit_id: visitId, task_id: taskId ?? null })
  ch.close()
}

function raise(r: Rec, level: TaskLevel, reasonCode: string, kind: 'report' | 'flag', evidenceId: string, at = Date.now()): Task {
  const reason = {
    rule_id: `demo-${reasonCode}-v1`,
    rule_version: '2026-11-07.demo',
    level,
    reason_code: reasonCode,
    evidence: [{ kind, id: evidenceId }],
    fired_at: iso(at),
  }
  if (!r.task) {
    const ackMin = level === 'red' ? 2 : 10
    const task: Task = {
      task_id: uuid(),
      visit_id: r.visit.visit_id,
      level,
      status: 'open',
      escalated: false,
      routed_to: ['physician'],
      reasons: [reason],
      created_at: iso(at),
      ack_due_at: iso(at + ackMin * MIN),
      delivered_at: iso(at),
      acknowledged_at: null,
      acknowledged_by: null,
      assessed_at: null,
      assessed_by: null,
      disposition: null,
    }
    r.task = task
    r.events.push({ type: 'task_event', task_id: task.task_id, event: 'created', at: iso(at), level, by: null })
    r.events.push({ type: 'task_event', task_id: task.task_id, event: 'delivered', at: iso(at), level, by: null })
    return task
  }
  // A task's level can only go up; new reasons are added to the same task.
  const raised = LEVELS.indexOf(level) > LEVELS.indexOf(r.task.level)
  r.task = { ...r.task, level: raised ? level : r.task.level, reasons: [...r.task.reasons, reason] }
  r.events.push({
    type: 'task_event',
    task_id: r.task.task_id,
    event: raised ? 'level_raised' : 'reason_added',
    at: iso(at),
    level: r.task.level,
    by: null,
  })
  return r.task
}

/** Server-side timers: a prompt overdue by 5 minutes opens a "silent" task. */
function tick(s: State, now: number) {
  let changed = false
  for (const r of s.visits) {
    if (r.visit.status !== 'waiting' || !r.visit.next_prompt_due_at) continue
    if (now - Date.parse(r.visit.next_prompt_due_at) >= 5 * MIN && !r.task) {
      const last = r.reports[r.reports.length - 1]
      raise(r, 'silent', 'missed_checkin', 'report', last?.report_id ?? uuid(), now)
      changed = true
    }
  }
  if (changed) save(s)
}

const findRec = (s: State, id: string) => {
  const r = s.visits.find((v) => v.visit.visit_id === id)
  if (!r) throw new MockError(404, 'Visit not found')
  return r
}

// ---- Nurse ----------------------------------------------------------------

export function enrol(body: VisitCreate): VisitEnrolled {
  const s = load()
  const now = Date.now()
  if (body.channel === 'pager' && s.visits.some((r) => r.visit.status === 'waiting' && r.visit.pager_no === body.pager_no)) {
    throw new MockError(409, 'That pager is already bound to a waiting patient')
  }
  const interval = intervalOf(body.ctas)
  const rec: Rec = {
    visit: {
      visit_id: uuid(),
      site_id: 'demo-site',
      ctas: body.ctas,
      complaint_group: body.complaint_group,
      cedis_code: body.cedis_code ?? null,
      language: body.language,
      channel: body.channel,
      pager_no: body.pager_no ?? null,
      status: 'waiting',
      triaged_at: iso(now),
      closed_at: null,
      next_prompt_due_at: iso(now + interval * MIN),
      staff_reassess_due_at: iso(now + interval * MIN),
      last_staff_check_at: null,
    },
    patientToken: randomToken(),
    companionToken: randomToken(),
    patientTokenUsed: false,
    companionTokenUsed: false,
    reports: [],
    vitals: [],
    flags: [],
    task: null,
    done: [],
    events: [],
  }
  s.visits.push(rec)
  save(s)
  notify(rec.visit.visit_id, 'visit.changed')
  return {
    visit_id: rec.visit.visit_id,
    patient_link: `${origin()}/v/${rec.patientToken}`,
    companion_link: `${origin()}/v/${rec.companionToken}`,
    links_expire_at: iso(now + 240 * MIN),
    pager_no: rec.visit.pager_no,
  }
}

const trendOf = (r: Rec): TrendPoint[] =>
  r.reports.flatMap((x): TrendPoint[] => {
    if (x.report.kind !== 'checkin') return []
    const c = x.report
    return [
      {
        at: x.received_at,
        pain: c.pain.kind === 'answered' ? c.pain.value : null,
        overall: c.overall.kind === 'answered' ? c.overall.value : null,
      },
    ]
  })

function worklistRow(r: Rec, now: number): Omit<WorklistRow, 'rank'> {
  const last = r.reports[r.reports.length - 1]
  const due = r.visit.next_prompt_due_at ? Date.parse(r.visit.next_prompt_due_at) : null
  return {
    visit: r.visit,
    open_task: r.task,
    silent: due !== null && now - due >= 5 * MIN,
    leave_risk: last?.report.kind === 'leaving',
    prompt_overdue: due !== null && now > due,
    reassess_overdue: r.visit.staff_reassess_due_at ? now > Date.parse(r.visit.staff_reassess_due_at) : false,
    last_report: last
      ? {
          at: last.received_at,
          kind: last.report.kind as 'checkin' | 'concern' | 'finding' | 'leaving',
          reporter: last.report.reporter,
          channel: last.report.channel,
        }
      : null,
    trend: trendOf(r),
  }
}

export function worklist(): Worklist {
  const s = load()
  const now = Date.now()
  tick(s, now)
  const rows = s.visits
    .filter((r) => r.visit.status === 'waiting')
    .map((r) => worklistRow(r, now))
    // Severity ranking, as the physician worklist defines it. The nurse board ignores `rank`.
    .sort((a, b) => {
      const la = a.open_task ? LEVELS.indexOf(a.open_task.level) : -1
      const lb = b.open_task ? LEVELS.indexOf(b.open_task.level) : -1
      return lb - la || Date.parse(a.visit.triaged_at) - Date.parse(b.visit.triaged_at)
    })
    .map((r, i) => ({ ...r, rank: i + 1 }))
  return { generated_at: iso(now), rows }
}

export function triageBoard(): TriageBoard {
  const s = load()
  const now = Date.now()
  tick(s, now)
  const rows: BoardRow[] = s.visits
    .filter((r) => r.visit.status === 'waiting')
    .map((r) => ({
      visit_id: r.visit.visit_id,
      ctas: r.visit.ctas,
      complaint_group: r.visit.complaint_group,
      triaged_at: r.visit.triaged_at,
      level: r.task?.level ?? null,
      staff_reassess_due_at: r.visit.staff_reassess_due_at,
      reassess_overdue: r.visit.staff_reassess_due_at ? now > Date.parse(r.visit.staff_reassess_due_at) : false,
    }))
  return { generated_at: iso(now), rows }
}

const stamp = (e: TimelineEntry) => Date.parse('received_at' in e ? e.received_at : e.at)

export function visitDetail(id: string): VisitDetail {
  const s = load()
  tick(s, Date.now())
  const r = findRec(s, id)
  const timeline: TimelineEntry[] = [...r.reports, ...r.vitals, ...r.flags, ...r.events].sort((a, b) => stamp(a) - stamp(b))
  return { visit: r.visit, open_task: r.task, timeline }
}

export function recordVitals(body: VitalsCreate): VitalsRecord {
  const s = load()
  const r = findRec(s, body.visit_id)
  const rec: VitalsRecord = {
    type: 'vitals',
    vitals_id: uuid(),
    visit_id: body.visit_id,
    measured_at: body.measured_at,
    received_at: iso(Date.now()),
    entered_by: NURSE,
    sbp: body.sbp ?? null,
    dbp: body.dbp ?? null,
    hr: body.hr ?? null,
    rr: body.rr ?? null,
    spo2: body.spo2 ?? null,
    temp_c: body.temp_c ?? null,
    supersedes: body.supersedes ?? null,
  }
  r.vitals.push(rec)
  r.visit = { ...r.visit, last_staff_check_at: rec.received_at }
  save(s)
  notify(body.visit_id, 'vitals.recorded')
  return rec
}

export function flagHigher(visitId: string, note: string | null): FlagRecord {
  const s = load()
  const r = findRec(s, visitId)
  const flag: FlagRecord = { type: 'flag', flag_id: uuid(), visit_id: visitId, received_at: iso(Date.now()), flagged_by: NURSE, note }
  r.flags.push(flag)
  const task = raise(r, 'amber', 'staff_flag', 'flag', flag.flag_id)
  save(s)
  notify(visitId, 'task.changed', task.task_id)
  return flag
}

const findTask = (s: State, taskId: string) => {
  const r = s.visits.find((v) => v.task?.task_id === taskId)
  if (!r) throw new MockError(404, 'Task not found')
  return r
}

export function acknowledge(taskId: string): Task {
  const s = load()
  const r = findTask(s, taskId)
  const t = r.task!
  if (t.status !== 'open') throw new MockError(409, 'Task is already acknowledged')
  const at = iso(Date.now())
  r.task = { ...t, status: 'acknowledged', acknowledged_at: at, acknowledged_by: NURSE }
  r.events.push({ type: 'task_event', task_id: t.task_id, event: 'acknowledged', at, level: t.level, by: NURSE })
  save(s)
  notify(r.visit.visit_id, 'task.changed', t.task_id)
  return r.task
}

function closeVisit(r: Rec, status: 'roomed' | 'left' | 'discharged', now: number) {
  r.visit = { ...r.visit, status, closed_at: iso(now) }
}

export function assess(taskId: string, disposition: Disposition): Task {
  const s = load()
  const r = findTask(s, taskId)
  const t = r.task!
  if (t.status !== 'acknowledged') throw new MockError(409, 'Acknowledge the task before assessing it')
  const now = Date.now()
  const at = iso(now)
  const done: Task = { ...t, status: 'completed', assessed_at: at, assessed_by: NURSE, disposition }
  r.events.push({ type: 'task_event', task_id: t.task_id, event: 'assessed', at, level: t.level, by: NURSE })
  r.done.push(done)
  r.task = null
  r.visit = { ...r.visit, last_staff_check_at: at, staff_reassess_due_at: iso(now + intervalOf(r.visit.ctas) * MIN) }
  if (disposition === 'roomed') closeVisit(r, 'roomed', now)
  if (disposition === 'treated_and_released') closeVisit(r, 'discharged', now)
  if (disposition === 'left_before_assessment' || disposition === 'not_located') closeVisit(r, 'left', now)
  save(s)
  notify(r.visit.visit_id, 'task.changed', t.task_id)
  return done
}

export function setVisitStatus(visitId: string, status: 'roomed' | 'left' | 'discharged') {
  const s = load()
  const r = findRec(s, visitId)
  closeVisit(r, status, Date.now())
  save(s)
  notify(visitId, 'visit.changed')
}

// ---- Patient and companion ------------------------------------------------

const getSession = (): Session | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : memorySession
  } catch {
    return memorySession
  }
}

export function exchange(tok: string): SessionInfo {
  const s = load()
  const r = s.visits.find((v) => v.patientToken === tok || v.companionToken === tok)
  if (!r) throw new MockError(404, 'Unknown code')
  const role = r.patientToken === tok ? 'patient' : 'companion'
  const used = role === 'patient' ? r.patientTokenUsed : r.companionTokenUsed
  const mine = getSession()
  const sameDevice = mine?.visitId === r.visit.visit_id && mine.role === role
  if (Date.now() - Date.parse(r.visit.triaged_at) > 240 * MIN) throw new MockError(410, 'This code has expired')
  if (used && !sameDevice) throw new MockError(410, 'This code was already used')
  if (role === 'patient') r.patientTokenUsed = true
  else r.companionTokenUsed = true
  const session: Session = { visitId: r.visit.visit_id, role }
  memorySession = session
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    /* memory only */
  }
  save(s)
  return { role, language: r.visit.language, expires_at: iso(Date.now() + 240 * MIN) }
}

function requireSession() {
  const sess = getSession()
  if (!sess) throw new MockError(401, 'No session')
  const s = load()
  return { s, r: findRec(s, sess.visitId), role: sess.role }
}

export function patientHome(): PatientHome {
  const { s, r, role } = requireSession()
  // The visit's own items, plus any follow-up items an earlier urgent finding asked for.
  const triggered = r.reports.flatMap((x) => s.submissions[x.report_id]?.receipt.follow_up_items ?? [])
  const items = [...BANK[r.visit.complaint_group]]
  for (const key of new Set(triggered)) {
    const item = itemByKey(key)
    if (item && !items.some((i) => i.key === key)) items.push(item)
  }
  return {
    role,
    language: r.visit.language,
    wait_range: { low_minutes: 30, high_minutes: 90, source: 'site_estimate', as_of: iso(Date.now()) },
    next_checkin_due_at: r.visit.next_prompt_due_at,
    questionnaire_version: '2026-11-07.demo',
    items,
    message: 'none',
  }
}

export function submitReport(body: PatientReport): ReportReceipt {
  const { s, r, role } = requireSession()
  const fingerprint = JSON.stringify(body)
  const prior = s.submissions[body.submission_id]
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new MockError(409, 'Submission id reused with different content')
    return { ...prior.receipt, duplicate: true }
  }
  if (body.reporter !== role) throw new MockError(422, 'Reporter does not match the session')
  if (body.kind === 'checkin' && body.reporter === 'companion' && body.pain.kind !== 'missing') {
    throw new MockError(422, 'Pain is self-reported; a companion must send it as missing')
  }
  const now = Date.now()
  r.reports.push({ type: 'report', report_id: body.submission_id, visit_id: r.visit.visit_id, received_at: iso(now), report: body })

  let level: TaskLevel | null = null
  let reasonCode = ''
  let message: ReportReceipt['patient_message'] = 'none'
  const findings =
    body.kind === 'finding' ? body.findings : body.kind === 'checkin' && body.new_findings.kind === 'answered' ? body.new_findings.value : []

  if (body.kind === 'concern') {
    level = body.concern === 'help_now' ? 'red' : 'amber'
    reasonCode = `concern_${body.concern}`
  }
  if (findings.length > 0) {
    level = 'red'
    reasonCode = `finding_${findings[0]}`
  } else if (body.kind === 'checkin' && body.overall.kind === 'answered' && body.overall.value === 'worse') {
    level = 'amber'
    reasonCode = 'overall_worse'
  }
  if (body.kind === 'leaving') {
    level = 'leave_risk'
    reasonCode = 'leaving'
    message = 'leaving_info'
  }
  if (level) {
    const had = r.task !== null
    const task = raise(r, level, reasonCode, 'report', body.submission_id, now)
    if (message === 'none') message = had ? 'clinician_told' : 'clinician_will_check'
    notify(r.visit.visit_id, 'task.changed', task.task_id)
  }
  if (body.kind === 'checkin') {
    // The patient timer restarts. The staff reassessment timer never moves.
    r.visit = { ...r.visit, next_prompt_due_at: iso(now + intervalOf(r.visit.ctas) * MIN) }
  }
  const followUps = [...new Set(findings.flatMap((f) => FOLLOW_UP[f] ?? []))]
  const receipt: ReportReceipt = {
    submission_id: body.submission_id,
    received_at: iso(now),
    duplicate: false,
    patient_message: message,
    follow_up_items: followUps,
  }
  s.submissions[body.submission_id] = { fingerprint, receipt }
  save(s)
  notify(r.visit.visit_id, 'report.received')
  return receipt
}
