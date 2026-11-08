// In-memory stand-in for the backend, typed by the generated contract so it
// cannot drift from it, and built on the real question bank (../bank.ts,
// ../enableWhen.ts, ../cedis.ts) so wording, branching and the CEDIS rules
// match the backend. State is saved to localStorage so a nurse tab and a
// patient tab on the same origin see the same visits. This is demo logic, not
// the real rules engine: thresholds and task levels here are demo assumptions.
import { attentionParams, bankVersion, ext, item, options, allowUnsure } from '../bank'
import { checkEnrolment } from '../cedis'
import { isUrgentFinding } from '@/lib/findings'
import { followUps, rawAnswers, type AnswerValue } from '../enableWhen'
import type {
  AppExclusion,
  AttentionPrompt,
  AttentionStep,
  BoardRow,
  ChargeNurseView,
  CheckinReport,
  ConcernCode,
  Disposition,
  FeelingChange,
  FeelingNow,
  FindingCode,
  FlagRecord,
  Handover,
  ItemAnswer,
  PatientHome,
  PatientReport,
  PushConfig,
  QuestionItem,
  ReportReceipt,
  ReportRecord,
  Role,
  SessionEndReason,
  SessionInfo,
  SessionRecord,
  SignInConflict,
  SiteSettings,
  SiteSettingsUpdate,
  StaffRef,
  Task,
  TaskEvent,
  TaskLevel,
  TimelineEntry,
  TokenExchange,
  TrendPoint,
  TriageBoard,
  VisitCreate,
  VisitDetail,
  VisitEnrolled,
  VisitLink,
  VisitSummary,
  VitalsCreate,
  VitalsRecord,
  Worklist,
  WorklistRow,
} from '../types'

export class MockError extends Error {
  readonly status: number
  /** Sent as the response body instead of `{ detail }`, e.g. a SignInConflict. */
  readonly body?: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

interface Prompt {
  prompt: AttentionPrompt
  expectedCount: number
  used: boolean
}
interface Rec {
  visit: VisitSummary
  /** One QR token per app visit, null when the app is not offered. */
  token: string | null
  /** Every sign-in, oldest first. At most one is open (no ended_at). */
  sessions: SessionRecord[]
  reports: ReportRecord[]
  vitals: VitalsRecord[]
  flags: FlagRecord[]
  task: Task | null
  done: Task[]
  events: TaskEvent[]
  prompts: Prompt[]
  /** Latest answer to each follow-up item, for branching. */
  answers: Record<string, AnswerValue>
}
interface State {
  visits: Rec[]
  submissions: Record<string, { fingerprint: string; receipt: ReportReceipt }>
  /** Absent until a nurse saves settings, like a site with no site_setting row. */
  settings?: SiteSettings
}
/** This device's sign-in, standing in for the HttpOnly session cookie. */
interface Session {
  visitId: string
  sessionId: string
  role: Role
}

const KEY = 'recheck-mock-state-v4'
const SESSION_KEY = 'recheck-mock-session-v4'
export const NURSE: StaffRef = { user_id: 'demo-nurse', role: 'triage_nurse' }

/** Browser demo attribution only. Production identity belongs to the server session. */
function demoStaff(): StaffRef {
  try {
    const role = sessionStorage.getItem('recheck-demo-role')
    if (role === 'physician' || role === 'charge_nurse') return { user_id: `demo-${role}`, role }
  } catch { /* fall back to the seeded nurse */ }
  return NURSE
}

// Staff sign-in. The mocks have no Auth0, only the demo role picker; the role
// lives in sessionStorage, standing in for the HttpOnly staff cookie.
const DEMO_ROLE_KEY = 'recheck-demo-role'
const STAFF_ROLES: StaffRef['role'][] = ['triage_nurse', 'physician', 'charge_nurse', 'quality']

export const signInOptions = () => ({ auth0: false, demo: true })

export function staffSession() {
  let role: string | null = null
  try {
    role = sessionStorage.getItem(DEMO_ROLE_KEY)
  } catch { /* no storage: signed out */ }
  const known = STAFF_ROLES.find((r) => r === role)
  if (!known) throw new MockError(401, 'staff sign-in required')
  return { user_id: `demo|${known}`, name: null, role: known, site_id: 'foothills-demo' }
}

export function demoStaffSignIn(role: StaffRef['role']) {
  if (!STAFF_ROLES.includes(role)) throw new MockError(422, 'unknown role')
  try {
    sessionStorage.setItem(DEMO_ROLE_KEY, role)
  } catch { /* in memory only */ }
  return staffSession()
}

export function clearStaffSession(): undefined {
  try {
    sessionStorage.removeItem(DEMO_ROLE_KEY)
  } catch { /* ignore */ }
  return undefined
}

/** Signs the triage complaint already covers (rules.KNOWN_AT_TRIAGE). */
const KNOWN_AT_TRIAGE: Partial<Record<VisitSummary['complaint_group'], FindingCode[]>> = {
  chest_back_pain: ['chest_pain'],
  confused_drowsy: ['new_confusion', 'drowsiness'],
}

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
const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))

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

// ---- Question bank as the API serves it ----------------------------------

/** A bank follow-up as a contract QuestionItem, in the answerer's wording. */
export function questionItem(linkId: string, role: Role): QuestionItem {
  const i = item(linkId)
  const text = role === 'companion' ? (ext<string>(i, 'companion-text') ?? i.text ?? linkId) : (i.text ?? linkId)
  const input_type: QuestionItem['input_type'] =
    i.type === 'boolean' ? 'yes_no' : i.type === 'integer' ? 'scale' : i.repeats ? 'multi_choice' : 'choice'
  return {
    key: linkId,
    input_type,
    text,
    options: options(linkId).map((o) => ({ code: o.code, text: o.text })),
    allow_unsure: allowUnsure(linkId),
  }
}

// ---- Circle-counting check (mirrors api/src/recheck/attention.py) ---------

const MIN_JUMP = 0.25
const MARGIN = 0.1

function generateSteps(): { steps: AttentionStep[]; circles: number } {
  const p = attentionParams()
  const circles = randInt(p.circlesMin, p.circlesMax)
  const squares = randInt(p.squaresMin, p.squaresMax)
  const shapes: ('circle' | 'square')[] = [...Array<'circle'>(circles).fill('circle'), ...Array<'square'>(squares).fill('square')]
  for (let i = shapes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shapes[i], shapes[j]] = [shapes[j]!, shapes[i]!]
  }
  const steps: AttentionStep[] = []
  let prev: [number, number] | null = null
  for (const shape of shapes) {
    let x = 0
    let y = 0
    do {
      x = MARGIN + Math.random() * (1 - 2 * MARGIN)
      y = MARGIN + Math.random() * (1 - 2 * MARGIN)
    } while (prev && Math.hypot(x - prev[0], y - prev[1]) < MIN_JUMP)
    prev = [x, y]
    steps.push({ shape, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 })
  }
  return { steps, circles }
}

/** The current unanswered, unexpired prompt for a visit, or a new one. */
function currentPrompt(r: Rec, now: number): Prompt {
  const live = r.prompts.find((p) => !p.used && Date.parse(p.prompt.expires_at) > now)
  if (live) return live
  const params = attentionParams()
  const { steps, circles } = generateSteps()
  const created: Prompt = {
    prompt: {
      prompt_id: uuid(),
      steps: steps as AttentionPrompt['steps'],
      show_ms: params.showMs,
      gap_ms: params.gapMs,
      expires_at: iso(now + params.expiresMinutes * MIN),
    },
    expectedCount: circles,
    used: false,
  }
  r.prompts.push(created)
  return created
}

// ---- Seeds ----------------------------------------------------------------
//
// A waiting room of 25 synthetic visits, all relative to "now". Every task is
// one the rules could raise (api/src/recheck/rules.py, scheduler.py): the level
// and reason code match what the report or timer would fire. Patient prompts
// and staff reassessments follow the CTAS interval from the last check-in and
// the last staff check, so the clocks agree with the history.

/** A stable UUID per seeded case, so references (P-xxxx) never change between resets. */
function stableId(ref: string): string {
  let h = 0x811c9dc5
  for (const c of ref) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0
  let hex = ''
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 15) ^ (i + 1), 0x2c1b3c6d) >>> 0
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
    h = (h ^ (h >>> 15)) >>> 0
    hex += h.toString(16).padStart(8, '0')
  }
  const variant = '89ab'[parseInt(hex[16]!, 16) % 4]!
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** The seeded visit's id, by case name (the `<case>` in `demo-<case>-token`). For tests and demo scripts. */
export const demoVisitId = (ref: string) => stableId(`recheck-demo-${ref}`)

type Seed = {
  ref: string
  ctas: number
  group: VisitSummary['complaint_group']
  cedis: string | null
  triagedMinAgo: number
  language?: VisitSummary['language']
  /** Pager number for pager visits; phone otherwise. */
  pager?: string
  exclusion?: AppExclusion
  /** Set for the original demo cases; computed from the history otherwise. */
  promptDueMin?: number | null
  reassessDueMin?: number
}

const PHYSICIAN: StaffRef = { user_id: 'demo-physician', role: 'physician' }

function seed(now: number): State {
  const at = (minAgo: number) => iso(now - minAgo * MIN)
  const mk = (s: Seed): Rec => ({
    visit: {
      visit_id: demoVisitId(s.ref),
      site_id: 'demo-site',
      ctas: s.ctas,
      complaint_group: s.group,
      cedis_code: s.cedis,
      language: s.language ?? 'en',
      app_exclusion: s.exclusion ?? null,
      channel: s.exclusion ? null : s.pager ? 'pager' : 'phone',
      pager_no: s.exclusion ? null : (s.pager ?? null),
      status: 'waiting',
      triaged_at: at(s.triagedMinAgo),
      closed_at: null,
      next_prompt_due_at:
        s.exclusion || s.promptDueMin === null ? null : iso(now + (s.promptDueMin ?? intervalOf(s.ctas) - s.triagedMinAgo) * MIN),
      staff_reassess_due_at: iso(now + (s.reassessDueMin ?? intervalOf(s.ctas) - s.triagedMinAgo) * MIN),
      last_staff_check_at: at(s.triagedMinAgo),
      signed_in_as: null,
      signed_in_since: null,
    },
    token: s.exclusion ? null : `demo-${s.ref}-token`,
    sessions: [],
    reports: [],
    vitals: [],
    flags: [],
    task: null,
    done: [],
    events: [],
    prompts: [],
    answers: {},
  })

  const push = (r: Rec, minAgo: number, report: PatientReport) => {
    r.reports.push({ type: 'report', report_id: report.submission_id, visit_id: r.visit.visit_id, received_at: at(minAgo), report })
    return report.submission_id
  }
  const reportBase = (r: Rec, minAgo: number, reporter: Role) => ({
    submission_id: uuid(),
    reporter,
    channel: r.visit.channel === 'pager' ? ('pager' as const) : ('phone' as const),
    captured_at: at(minAgo),
  })

  const addCheckin = (
    r: Rec,
    minAgo: number,
    change: FeelingChange,
    feeling: FeelingNow,
    pain: number | null,
    findings: FindingCode[],
    items: Record<string, ItemAnswer> = {},
    reporter: Role = 'patient',
    attention: CheckinReport['attention'] = { kind: 'missing', reason: 'not_asked' },
  ) => {
    const report: CheckinReport = {
      kind: 'checkin',
      ...reportBase(r, minAgo, reporter),
      questionnaire_version: bankVersion,
      feeling_now: { kind: 'answered', value: feeling },
      feeling_change: { kind: 'answered', value: change },
      pain: pain === null || reporter === 'companion' ? { kind: 'missing', reason: reporter === 'companion' ? 'not_asked' : 'unsure' } : { kind: 'answered', value: pain },
      new_findings: { kind: 'answered', value: findings },
      attention,
      items,
    }
    r.answers = { ...r.answers, ...rawAnswers(items) }
    return push(r, minAgo, report)
  }
  const addConcern = (r: Rec, minAgo: number, concern: ConcernCode, reporter: Role = 'patient') =>
    push(r, minAgo, { kind: 'concern', concern, ...reportBase(r, minAgo, reporter) })
  const addFinding = (r: Rec, minAgo: number, findings: [FindingCode, ...FindingCode[]], reporter: Role = 'patient') => {
    r.answers = { ...r.answers, new_findings: findings }
    return push(r, minAgo, { kind: 'finding', findings, ...reportBase(r, minAgo, reporter) })
  }
  const addLeaving = (r: Rec, minAgo: number, reporter: Role = 'patient') => push(r, minAgo, { kind: 'leaving', ...reportBase(r, minAgo, reporter) })

  /** A device signed in at `fromMinAgo`, still signed in unless `endedMinAgo` is given. */
  const signIn = (r: Rec, role: Role, fromMinAgo: number, endedMinAgo?: number, reason: SessionEndReason = 'signed_out') => {
    startSession(r, role, now - fromMinAgo * MIN, null)
    if (endedMinAgo !== undefined) endSession(r, reason, now - endedMinAgo * MIN)
  }

  /** Triage nurse vitals: a staff check, so the reassessment clock restarts from here. */
  const addVitals = (r: Rec, minAgo: number, v: Pick<VitalsRecord, 'sbp' | 'dbp' | 'hr' | 'rr' | 'spo2' | 'temp_c'>) => {
    r.vitals.push({ type: 'vitals', vitals_id: uuid(), visit_id: r.visit.visit_id, measured_at: at(minAgo + 1), received_at: at(minAgo), entered_by: NURSE, supersedes: null, ...v })
    r.visit = { ...r.visit, last_staff_check_at: at(minAgo) }
  }

  const ack = (r: Rec, minAgo: number, by: StaffRef) => {
    const t = r.task!
    r.task = { ...t, status: 'acknowledged', acknowledged_at: at(minAgo), acknowledged_by: by }
    r.events.push({ type: 'task_event', task_id: t.task_id, event: 'acknowledged', at: at(minAgo), level: t.level, by })
  }

  /** An earlier task already assessed; the visit has no open task now. */
  const complete = (r: Rec, ackMinAgo: number, assessMinAgo: number, disposition: Disposition) => {
    ack(r, ackMinAgo, PHYSICIAN)
    const t = r.task!
    r.done.push({ ...t, status: 'completed', assessed_at: at(assessMinAgo), assessed_by: PHYSICIAN, disposition })
    r.events.push({ type: 'task_event', task_id: t.task_id, event: 'assessed', at: at(assessMinAgo), level: t.level, by: PHYSICIAN })
    r.task = null
    r.visit = { ...r.visit, last_staff_check_at: at(assessMinAgo) }
  }

  const flag = (r: Rec, minAgo: number, note: string) => {
    const f: FlagRecord = { type: 'flag', flag_id: uuid(), visit_id: r.visit.visit_id, received_at: at(minAgo), flagged_by: NURSE, note }
    r.flags.push(f)
    raise(r, 'amber', 'staff_flag', 'flag', f.flag_id, now - minAgo * MIN)
  }

  /** Clocks from the history: next prompt one interval after the last check-in, reassessment one after the last staff check. */
  const schedule = (r: Rec) => {
    const step = intervalOf(r.visit.ctas) * MIN
    const checkins = r.reports.filter((x) => x.report.kind === 'checkin').map((x) => Date.parse(x.received_at))
    const promptFrom = Math.max(Date.parse(r.visit.triaged_at), ...checkins)
    r.visit = {
      ...r.visit,
      next_prompt_due_at: r.visit.app_exclusion ? null : iso(promptFrom + step),
      staff_reassess_due_at: iso(Date.parse(r.visit.last_staff_check_at ?? r.visit.triaged_at) + step),
    }
  }
  /** The scheduler's missed check-in: silent, five minutes after the prompt fell due. */
  const missed = (r: Rec) => {
    const last = r.reports[r.reports.length - 1]!
    raise(r, 'silent', 'missed_checkin', 'report', last.report_id, Date.parse(r.visit.next_prompt_due_at!) + 5 * MIN)
  }

  // ---- The original demo cases (README, tests and the demo script rely on these) ----

  const chest = mk({ ref: 'chest', ctas: 2, group: 'chest_back_pain', cedis: '003', triagedMinAgo: 42, promptDueMin: 12, reassessDueMin: 3 })
  const calm = mk({ ref: 'general', ctas: 3, group: 'general', cedis: null, triagedMinAgo: 55, promptDueMin: 9, reassessDueMin: 20 })
  const head = mk({ ref: 'head', ctas: 3, group: 'head_injury', cedis: '407', triagedMinAgo: 70, promptDueMin: -20, reassessDueMin: 5 })
  const confused = mk({ ref: 'confused', ctas: 3, group: 'confused_drowsy', cedis: '402', triagedMinAgo: 35, promptDueMin: 14, reassessDueMin: 11 })
  const child = mk({ ref: 'child', ctas: 4, group: 'general', cedis: '609', triagedMinAgo: 25, promptDueMin: null, reassessDueMin: 35, exclusion: 'child' })

  addCheckin(chest, 25, 'same', 'ok', 5, [])
  const worse = addCheckin(chest, 3, 'much_worse', 'poor', 8, ['chest_pain'], { pain_moved: { kind: 'yes_no', value: true } })
  addCheckin(calm, 40, 'better', 'good', 3, [])
  addCheckin(calm, 20, 'same', 'good', 2, [])
  const first = addCheckin(head, 62, 'same', 'ok', 3, [])
  addCheckin(confused, 12, 'same', 'ok', null, [], {}, 'companion')

  // A companion's phone is already signed in here, so scanning this visit's QR
  // on another device asks to take over.
  startSession(confused, 'companion', now - 30 * MIN, null)

  // Unacknowledged past its 2-minute deadline, so the scheduler routes it to the charge nurse.
  raise(chest, 'red', 'finding_chest_pain', 'report', worse, now - 3 * MIN)
  raise(head, 'silent', 'missed_checkin', 'report', first, now - 5 * MIN)

  // ---- CTAS 2 ----

  // Asthma, much worse with new trouble breathing; the physician acknowledged in time.
  const breathing = mk({ ref: 'breathing', ctas: 2, group: 'general', cedis: null, triagedMinAgo: 16, language: 'tl' })
  signIn(breathing, 'patient', 15)
  addCheckin(breathing, 12, 'same', 'ok', 3, [])
  const breathless = addCheckin(breathing, 3, 'much_worse', 'poor', 6, ['trouble_breathing'])
  raise(breathing, 'red', 'finding_trouble_breathing', 'report', breathless, now - 3 * MIN)
  ack(breathing, 2, PHYSICIAN)
  schedule(breathing)

  // Bad headache on a pager, settling. No task.
  const headache = mk({ ref: 'headache', ctas: 2, group: 'neuro_change', cedis: '404', triagedMinAgo: 22, language: 'es', pager: '214' })
  addCheckin(headache, 17, 'same', 'poor', 8, [])
  addVitals(headache, 10, { sbp: 162, dbp: 94, hr: 88, rr: 18, spo2: 98, temp_c: 36.9 })
  addCheckin(headache, 2, 'better', 'ok', 6, [])
  schedule(headache)

  // ---- CTAS 3 ----

  // Arm weakness; the daughter reports a facial droop. Red, unacknowledged, so it reaches the backup.
  const droop = mk({ ref: 'droop', ctas: 3, group: 'neuro_change', cedis: '409', triagedMinAgo: 48, language: 'pa' })
  signIn(droop, 'companion', 44)
  addCheckin(droop, 40, 'same', 'ok', null, [], {}, 'companion')
  addCheckin(droop, 20, 'same', 'poor', null, [], {}, 'companion')
  const droopFinding = addFinding(droop, 7, ['facial_droop'], 'companion')
  raise(droop, 'red', 'finding_facial_droop', 'report', droopFinding, now - 7 * MIN)
  schedule(droop)

  // Back pain creeping up, then "I need help now": red, unacknowledged, so it has reached the backup too.
  const backpain = mk({ ref: 'backpain', ctas: 3, group: 'chest_back_pain', cedis: '551', triagedMinAgo: 95, language: 'zh' })
  signIn(backpain, 'patient', 92)
  addCheckin(backpain, 85, 'same', 'ok', 5, [])
  addCheckin(backpain, 55, 'same', 'ok', 6, [])
  addVitals(backpain, 20, { sbp: 138, dbp: 84, hr: 96, rr: 18, spo2: 99, temp_c: 37.0 })
  addCheckin(backpain, 25, 'worse', 'ok', 7, [])
  const helpNow = addConcern(backpain, 4, 'help_now')
  raise(backpain, 'red', 'concern_help_now', 'report', helpNow, now - 4 * MIN)
  schedule(backpain)

  // Flank pain easing, then the phone went quiet: silent, acknowledged by the triage nurse.
  const flank = mk({ ref: 'flank', ctas: 3, group: 'chest_back_pain', cedis: '301', triagedMinAgo: 130, language: 'ar' })
  signIn(flank, 'patient', 128, 60)
  addCheckin(flank, 120, 'same', 'ok', 7, [])
  addCheckin(flank, 90, 'better', 'good', 4, [])
  addCheckin(flank, 62, 'better', 'good', 3, [])
  addVitals(flank, 25, { sbp: 128, dbp: 78, hr: 82, rr: 16, spo2: 98, temp_c: 37.4 })
  schedule(flank)
  missed(flank)
  ack(flank, 22, NURSE)

  // Vomiting on a pager: amber, acknowledged. The next prompt is a few minutes overdue.
  const vomiting = mk({ ref: 'vomiting', ctas: 3, group: 'general', cedis: null, triagedMinAgo: 75, language: 'vi', pager: '118' })
  addCheckin(vomiting, 65, 'same', 'ok', 4, [])
  const vomit = addCheckin(vomiting, 33, 'worse', 'poor', 5, ['vomiting'])
  raise(vomiting, 'amber', 'finding_vomiting', 'report', vomit, now - 33 * MIN)
  ack(vomiting, 28, PHYSICIAN)
  addVitals(vomiting, 28, { sbp: 112, dbp: 70, hr: 104, rr: 18, spo2: 97, temp_c: 37.8 })
  schedule(vomiting)

  // Low blood sugar; the partner is worried. Amber, open.
  const sugar = mk({ ref: 'sugar', ctas: 3, group: 'confused_drowsy', cedis: '854', triagedMinAgo: 40 })
  signIn(sugar, 'companion', 38)
  addVitals(sugar, 20, { sbp: 124, dbp: 76, hr: 92, rr: 16, spo2: 98, temp_c: 36.6 })
  addCheckin(sugar, 28, 'same', 'ok', null, [], {}, 'companion')
  const worried = addConcern(sugar, 6, 'worried', 'companion')
  raise(sugar, 'amber', 'concern_worried', 'report', worried, now - 6 * MIN)
  schedule(sugar)

  // Facial cut after three hours: says they are leaving. Leave risk, open.
  const cut = mk({ ref: 'cut', ctas: 3, group: 'head_injury', cedis: '102', triagedMinAgo: 185 })
  signIn(cut, 'patient', 182)
  addCheckin(cut, 150, 'same', 'ok', 4, [])
  addCheckin(cut, 95, 'same', 'ok', 5, [])
  addVitals(cut, 25, { sbp: 132, dbp: 82, hr: 78, rr: 16, spo2: 99, temp_c: 36.8 })
  addCheckin(cut, 22, 'same', 'ok', 5, [])
  const leaving = addLeaving(cut, 4)
  raise(cut, 'leave_risk', 'leaving', 'report', leaving, now - 4 * MIN)
  schedule(cut)

  // Vertigo: the circle count did not match. Overdue (in-person check), open.
  const vertigo = mk({ ref: 'vertigo', ctas: 3, group: 'neuro_change', cedis: '403', triagedMinAgo: 58, language: 'ko' })
  signIn(vertigo, 'patient', 56)
  addCheckin(vertigo, 50, 'same', 'ok', 2, [])
  const miscount = addCheckin(vertigo, 20, 'same', 'ok', 2, [], {}, 'patient', { kind: 'answered', prompt_id: uuid(), count: 3 })
  raise(vertigo, 'overdue', 'attention_incorrect', 'report', miscount, now - 20 * MIN)
  schedule(vertigo)

  // App not offered: self-harm. Staff watch directly; vitals restart the reassessment clock.
  const selfHarm = mk({ ref: 'selfharm', ctas: 3, group: 'general', cedis: '351', triagedMinAgo: 64, exclusion: 'self_harm_or_violence' })
  addVitals(selfHarm, 20, { sbp: 126, dbp: 80, hr: 90, rr: 16, spo2: 99, temp_c: 36.7 })
  schedule(selfHarm)

  // ---- CTAS 4 ----

  // App not offered: pregnancy over 20 weeks. The triage nurse flagged it higher; the physician acknowledged.
  const pregnancy = mk({ ref: 'pregnancy', ctas: 4, group: 'general', cedis: '458', triagedMinAgo: 50, language: 'hi', exclusion: 'pregnancy_over_20_weeks' })
  addVitals(pregnancy, 45, { sbp: 142, dbp: 92, hr: 86, rr: 16, spo2: 99, temp_c: 36.8 })
  flag(pregnancy, 12, 'Says the baby is moving less.')
  ack(pregnancy, 8, PHYSICIAN)
  schedule(pregnancy)

  // Back pain, stable, with a question for the desk. Overdue, triage nurse only, open.
  const desk = mk({ ref: 'desk', ctas: 4, group: 'chest_back_pain', cedis: '551', triagedMinAgo: 140, language: 'pa' })
  signIn(desk, 'patient', 135)
  addCheckin(desk, 128, 'same', 'ok', 6, [])
  addVitals(desk, 75, { sbp: 130, dbp: 82, hr: 76, rr: 14, spo2: 99, temp_c: 36.6 })
  addCheckin(desk, 70, 'same', 'ok', 6, [])
  addCheckin(desk, 12, 'better', 'good', 4, [])
  const question = addConcern(desk, 8, 'desk_question')
  raise(desk, 'overdue', 'concern_desk_question', 'report', question, now - 8 * MIN, ['triage_nurse'])
  schedule(desk)

  // Pager visit with a desk question, acknowledged by the triage nurse.
  const wrist = mk({ ref: 'wrist', ctas: 4, group: 'general', cedis: null, triagedMinAgo: 210, language: 'yue', pager: '305' })
  addCheckin(wrist, 190, 'same', 'ok', 5, [])
  addCheckin(wrist, 130, 'same', 'ok', 4, [])
  addVitals(wrist, 50, { sbp: 118, dbp: 74, hr: 72, rr: 14, spo2: 99, temp_c: 36.5 })
  addCheckin(wrist, 45, 'better', 'good', 3, [])
  const wristQuestion = addConcern(wrist, 15, 'desk_question')
  raise(wrist, 'overdue', 'concern_desk_question', 'report', wristQuestion, now - 15 * MIN, ['triage_nurse'])
  ack(wrist, 10, NURSE)
  schedule(wrist)

  // Tingling hands, says they are leaving; the triage nurse acknowledged.
  const tingling = mk({ ref: 'tingling', ctas: 4, group: 'neuro_change', cedis: '410', triagedMinAgo: 165, language: 'fr' })
  signIn(tingling, 'patient', 162)
  addCheckin(tingling, 150, 'same', 'ok', 3, [])
  addCheckin(tingling, 95, 'same', 'ok', 4, [])
  addVitals(tingling, 30, { sbp: 122, dbp: 78, hr: 74, rr: 14, spo2: 99, temp_c: 36.7 })
  addCheckin(tingling, 38, 'same', 'ok', 4, [])
  const goingHome = addLeaving(tingling, 10)
  raise(tingling, 'leave_risk', 'leaving', 'report', goingHome, now - 10 * MIN)
  ack(tingling, 6, NURSE)
  schedule(tingling)

  // Neck strain on a pager that stopped answering: silent, open.
  const neck = mk({ ref: 'neck', ctas: 4, group: 'head_injury', cedis: '105', triagedMinAgo: 155, pager: '422' })
  addCheckin(neck, 140, 'same', 'ok', 4, [])
  addVitals(neck, 70, { sbp: 134, dbp: 86, hr: 80, rr: 16, spo2: 98, temp_c: 36.6 })
  addCheckin(neck, 80, 'same', 'ok', 3, [])
  schedule(neck)
  missed(neck)

  // Just triaged: no reports yet.
  const ankle = mk({ ref: 'ankle', ctas: 4, group: 'general', cedis: null, triagedMinAgo: 5, language: 'es', pager: '131' })
  schedule(ankle)

  // Felt worse earlier, was assessed stable and stays in the waiting room. No open task; reassessment overdue.
  const stable = mk({ ref: 'stable', ctas: 4, group: 'general', cedis: null, triagedMinAgo: 100 })
  signIn(stable, 'patient', 98, 40)
  const earlier = addCheckin(stable, 90, 'worse', 'poor', 6, [])
  raise(stable, 'amber', 'feeling_worse', 'report', earlier, now - 90 * MIN)
  complete(stable, 85, 70, 'assessed_stable')
  addCheckin(stable, 45, 'better', 'good', 3, [])
  schedule(stable)

  // ---- CTAS 5 ----

  // Nearly five hours, steady, nobody signed in now.
  const rash = mk({ ref: 'rash', ctas: 5, group: 'general', cedis: null, triagedMinAgo: 290 })
  signIn(rash, 'patient', 288, 35)
  addCheckin(rash, 270, 'same', 'good', 2, [])
  addCheckin(rash, 150, 'same', 'good', 2, [])
  addVitals(rash, 110, { sbp: 120, dbp: 76, hr: 70, rr: 14, spo2: 99, temp_c: 36.6 })
  addCheckin(rash, 40, 'same', 'ok', 3, [])
  schedule(rash)

  // Pager visit; the next prompt is two minutes overdue and nothing is open yet.
  const sore = mk({ ref: 'sore', ctas: 5, group: 'general', cedis: null, triagedMinAgo: 230, language: 'pl', pager: '507' })
  addCheckin(sore, 215, 'same', 'ok', 2, [])
  addVitals(sore, 100, { sbp: 116, dbp: 72, hr: 68, rr: 14, spo2: 99, temp_c: 36.9 })
  addCheckin(sore, 122, 'worse', 'ok', 3, [])
  schedule(sore)

  // Mild headache now much worse: amber, acknowledged.
  const migraine = mk({ ref: 'migraine', ctas: 5, group: 'neuro_change', cedis: '404', triagedMinAgo: 180, language: 'ur' })
  signIn(migraine, 'patient', 178)
  addCheckin(migraine, 170, 'same', 'ok', 3, [])
  addCheckin(migraine, 110, 'same', 'ok', 4, [])
  const muchWorse = addCheckin(migraine, 55, 'much_worse', 'poor', 7, [])
  raise(migraine, 'amber', 'feeling_worse', 'report', muchWorse, now - 55 * MIN)
  ack(migraine, 48, PHYSICIAN)
  addVitals(migraine, 47, { sbp: 136, dbp: 88, hr: 84, rr: 16, spo2: 99, temp_c: 36.8 })
  schedule(migraine)

  const visits = [
    chest, calm, head, confused, child,
    breathing, headache,
    droop, backpain, flank, vomiting, sugar, cut, vertigo, selfHarm,
    pregnancy, desk, wrist, tingling, neck, ankle, stable,
    rash, sore, migraine,
  ]
  for (const r of visits) {
    r.reports.sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at))
    r.vitals.sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at))
  }
  return { visits, submissions: {} }
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

function raise(
  r: Rec,
  level: TaskLevel,
  reasonCode: string,
  kind: 'report' | 'flag',
  evidenceId: string,
  at = Date.now(),
  routedTo: Task['routed_to'] = ['physician'],
): Task {
  const reason = {
    rule_id: `demo_${reasonCode}_v1`,
    rule_version: '2026-11-08.demo',
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
      routed_to: routedTo,
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
  const deadline = iso(at + (level === 'red' ? 2 : 10) * MIN)
  r.task = {
    ...r.task,
    level: raised ? level : r.task.level,
    routed_to: [...new Set([...r.task.routed_to, ...routedTo])],
    ack_due_at: r.task.ack_due_at && r.task.ack_due_at < deadline ? r.task.ack_due_at : deadline,
    reasons: [...r.task.reasons, reason],
  }
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

/**
 * Server-side timers (api/src/recheck/scheduler.py): a prompt overdue by 5 minutes
 * opens a "silent" task, and a red task still unacknowledged at its deadline is
 * escalated and routed to the charge nurse as backup. Excluded visits have no prompts.
 */
function tick(s: State, now: number) {
  let changed = false
  for (const r of s.visits) {
    const t = r.task
    if (r.visit.status === 'waiting' && t && t.level === 'red' && t.status === 'open' && !t.escalated && t.ack_due_at && Date.parse(t.ack_due_at) <= now) {
      // The backup role is added in staff_role enum order, as the scheduler's ORDER BY does.
      r.task = { ...t, escalated: true, routed_to: STAFF_ROLES.filter((x) => x === 'charge_nurse' || t.routed_to.includes(x)) }
      r.events.push({ type: 'task_event', task_id: t.task_id, event: 'escalated', at: t.ack_due_at, level: t.level, by: null })
      changed = true
    }
    if (r.visit.status !== 'waiting' || r.visit.app_exclusion || !r.visit.next_prompt_due_at) continue
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
  const exclusion = body.app_exclusion ?? null

  if (exclusion && (body.channel || body.pager_no)) throw new MockError(422, 'no channel or pager is set when the app is not offered')
  if (!exclusion && !body.channel) throw new MockError(422, 'channel is required when the app is offered')
  const conflict = checkEnrolment({ cedis_code: body.cedis_code ?? null, complaint_group: body.complaint_group, app_exclusion: exclusion })
  if (conflict) throw new MockError(422, conflict.message)
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
      app_exclusion: exclusion,
      channel: exclusion ? null : (body.channel ?? 'phone'),
      pager_no: body.pager_no ?? null,
      status: 'waiting',
      triaged_at: iso(now),
      closed_at: null,
      next_prompt_due_at: exclusion ? null : iso(now + interval * MIN),
      staff_reassess_due_at: iso(now + interval * MIN),
      last_staff_check_at: null,
      signed_in_as: null,
      signed_in_since: null,
    },
    token: exclusion ? null : randomToken(),
    sessions: [],
    reports: [],
    vitals: [],
    flags: [],
    task: null,
    done: [],
    events: [],
    prompts: [],
    answers: {},
  }
  s.visits.push(rec)
  save(s)
  notify(rec.visit.visit_id, 'visit.changed')
  return {
    visit_id: rec.visit.visit_id,
    app_exclusion: exclusion,
    link: rec.token ? linkFor(rec.token) : null,
    pager_no: exclusion ? null : rec.visit.pager_no,
  }
}

const linkFor = (token: string) => `${origin()}/v/${token}`

/** The visit's QR again, for the desk. Refused once the visit closes or stops offering the app. */
export function visitLink(visitId: string): VisitLink {
  const r = findRec(load(), visitId)
  if (r.visit.status !== 'waiting') throw new MockError(410, 'The visit is closed')
  if (r.visit.app_exclusion || !r.token) throw new MockError(409, 'The app is not offered for this visit')
  return { visit_id: visitId, link: linkFor(r.token) }
}

/** Staff sign out whichever device is signed in, for example a lost phone. */
export function staffSignOut(visitId: string) {
  const s = load()
  const r = findRec(s, visitId)
  if (!openSession(r)) throw new MockError(409, 'No device is signed in')
  endSession(r, 'staff_signed_out', Date.now())
  save(s)
  notify(visitId, 'visit.changed')
}

/** Staff stop offering the app. Irreversible: prompts stop, devices are signed out, the staff timer keeps running. */
export function setExclusion(visitId: string, reason: AppExclusion) {
  const s = load()
  const r = findRec(s, visitId)
  if (r.visit.app_exclusion) throw new MockError(409, 'an app exclusion cannot be removed or changed')
  r.visit = { ...r.visit, app_exclusion: reason, next_prompt_due_at: null }
  endSession(r, 'app_excluded', Date.now())
  save(s)
  notify(visitId, 'visit.changed')
}

const trendOf = (r: Rec): TrendPoint[] =>
  r.reports.flatMap((x): TrendPoint[] => {
    if (x.report.kind !== 'checkin') return []
    const c = x.report
    return [
      {
        at: x.received_at,
        pain: c.pain.kind === 'answered' ? c.pain.value : null,
        feeling_now: c.feeling_now.kind === 'answered' ? c.feeling_now.value : null,
        feeling_change: c.feeling_change.kind === 'answered' ? c.feeling_change.value : null,
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

/** Highest level first, then oldest (views.by_urgency). */
const byUrgency = (tasks: Task[]) =>
  [...tasks].sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || Date.parse(a.created_at) - Date.parse(b.created_at))

/** The signed-in demo role, as the API's require_staff would see it. */
function requireRole(...roles: StaffRef['role'][]) {
  const { role } = staffSession()
  if (!roles.includes(role)) throw new MockError(403, `${role} can't do this`)
}

/**
 * Charge nurse view (views.for_charge_nurse): escalated tasks, anything routed to
 * the charge nurse, and triage nurse flags. The mock has no TLP hours, so the
 * physician is always on duty.
 */
export function escalations(): ChargeNurseView {
  requireRole('charge_nurse')
  const s = load()
  const now = Date.now()
  tick(s, now)
  const tasks = s.visits.flatMap((r) => (r.visit.status === 'waiting' && r.task ? [r.task] : []))
  const mine = tasks.filter((t) => t.escalated || t.routed_to.includes('charge_nurse') || t.reasons.some((x) => x.reason_code === 'staff_flag'))
  return { generated_at: iso(now), tlp_on_duty: true, tasks: byUrgency(mine) }
}

/** Shift changes for handover (settings.shift_changes demo default: 07:00 and 19:00 local). */
const SHIFT_CHANGES = [7, 19]

function currentShift(now: number): [string, string] {
  const changes = [-1, 0, 1].flatMap((offset) =>
    SHIFT_CHANGES.map((hour) => {
      const d = new Date(now)
      d.setDate(d.getDate() + offset)
      d.setHours(hour, 0, 0, 0)
      return d.getTime()
    }),
  ).sort((a, b) => a - b)
  const start = Math.max(...changes.filter((c) => c <= now))
  const end = Math.min(...changes.filter((c) => c > now))
  return [iso(start), iso(end)]
}

/** Shift handover from a fixed template (FR19): patients as ranked on the worklist, open tasks, overdue reassessments. */
export function handover(): Handover {
  requireRole('triage_nurse', 'physician', 'charge_nurse')
  const { generated_at, rows } = worklist()
  const [shift_start, shift_end] = currentShift(Date.parse(generated_at))
  return {
    generated_at,
    shift_start,
    shift_end,
    patients: rows,
    open_tasks: byUrgency(rows.flatMap((r) => (r.open_task ? [r.open_task] : []))),
    reassess_overdue: rows.filter((r) => r.reassess_overdue).map((r) => r.visit.visit_id),
  }
}

export function siteSettings(): SiteSettings {
  return load().settings ?? { show_triage_level: false, updated_at: null }
}

export function updateSiteSettings(body: SiteSettingsUpdate): SiteSettings {
  const s = load()
  s.settings = { show_triage_level: body.show_triage_level, updated_at: iso(Date.now()) }
  save(s)
  return s.settings
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

const stamp = (e: TimelineEntry) => Date.parse('received_at' in e ? e.received_at : 'started_at' in e ? e.started_at : e.at)

export function visitDetail(id: string): VisitDetail {
  const s = load()
  tick(s, Date.now())
  const r = findRec(s, id)
  const timeline: TimelineEntry[] = [...r.reports, ...r.vitals, ...r.flags, ...r.events, ...r.sessions].sort((a, b) => stamp(a) - stamp(b))
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
    entered_by: demoStaff(),
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
  r.task = { ...t, status: 'acknowledged', acknowledged_at: at, acknowledged_by: demoStaff() }
  r.events.push({ type: 'task_event', task_id: t.task_id, event: 'acknowledged', at, level: t.level, by: demoStaff() })
  save(s)
  notify(r.visit.visit_id, 'task.changed', t.task_id)
  return r.task
}

function closeVisit(r: Rec, status: 'roomed' | 'left' | 'discharged', now: number) {
  r.visit = { ...r.visit, status, closed_at: iso(now) }
  endSession(r, 'visit_closed', now)
}

export function assess(taskId: string, disposition: Disposition): Task {
  const s = load()
  const r = findTask(s, taskId)
  const t = r.task!
  if (t.status !== 'acknowledged') throw new MockError(409, 'Acknowledge the task before assessing it')
  const now = Date.now()
  const at = iso(now)
  const done: Task = { ...t, status: 'completed', assessed_at: at, assessed_by: demoStaff(), disposition }
  r.events.push({ type: 'task_event', task_id: t.task_id, event: 'assessed', at, level: t.level, by: demoStaff() })
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

const setDevice = (session: Session | null) => {
  memorySession = session
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* memory only */
  }
}

const openSession = (r: Rec) => r.sessions.find((x) => x.ended_at === null) ?? null

function startSession(r: Rec, role: Role, at: number, replaces: string | null): SessionRecord {
  const rec: SessionRecord = {
    type: 'session',
    session_id: uuid(),
    visit_id: r.visit.visit_id,
    role,
    started_at: iso(at),
    ended_at: null,
    end_reason: null,
    replaces,
  }
  r.sessions.push(rec)
  r.visit = { ...r.visit, signed_in_as: role, signed_in_since: rec.started_at }
  return rec
}

function endSession(r: Rec, reason: SessionEndReason, at: number) {
  const open = openSession(r)
  if (!open) return
  Object.assign(open, { ended_at: iso(at), end_reason: reason })
  r.visit = { ...r.visit, signed_in_as: null, signed_in_since: null }
}

/**
 * Scan the QR and say who is using this device. One device per visit: if
 * another is signed in, answer 409 with SignInConflict until the person
 * confirms by resending that session's id as `takeover_session_id`.
 */
export function exchange(body: TokenExchange): SessionInfo {
  const s = load()
  const r = s.visits.find((v) => v.token !== null && v.token === body.token)
  if (!r) throw new MockError(404, 'Unknown code')
  if (r.visit.status !== 'waiting' || r.visit.app_exclusion) throw new MockError(410, 'This code is no longer active')
  const now = Date.now()
  const open = openSession(r)
  const mine = getSession()
  let replaced = false
  let replaces: string | null = null
  if (open && mine?.sessionId === open.session_id) {
    // This device signing in again, for example to switch role.
    endSession(r, 'signed_out', now)
  } else if (open && body.takeover_session_id === open.session_id) {
    endSession(r, 'takeover', now)
    replaced = true
    replaces = open.session_id
  } else if (open) {
    const conflict: SignInConflict = { session_id: open.session_id, signed_in_as: open.role, signed_in_since: open.started_at }
    throw new MockError(409, 'Another device is signed in', conflict)
  }
  const session = startSession(r, body.role, now, replaces)
  setDevice({ visitId: r.visit.visit_id, sessionId: session.session_id, role: body.role })
  save(s)
  notify(r.visit.visit_id, 'visit.changed')
  return { role: body.role, language: r.visit.language, replaced_other_device: replaced }
}

/** This device signs itself out. The visit's QR still works for the next sign-in. */
export function signOut() {
  const { s, r } = requireSession()
  endSession(r, 'signed_out', Date.now())
  setDevice(null)
  save(s)
  notify(r.visit.visit_id, 'visit.changed')
}

/** The open session must be this device's: takeover, sign-out and closing the visit all end it. */
function requireSession() {
  const sess = getSession()
  if (!sess) throw new MockError(401, 'No session')
  const s = load()
  const r = findRec(s, sess.visitId)
  if (openSession(r)?.session_id !== sess.sessionId) throw new MockError(401, 'Signed out')
  return { s, r, role: sess.role }
}

/** Follow-up items enabled by what has been answered, as (ask now, ask after routing). */
const enabledFollowUps = (r: Rec, answers: Record<string, AnswerValue>) =>
  followUps(r.visit.complaint_group, r.visit.cedis_code, answers)

export function patientHome(): PatientHome {
  const { s, r, role } = requireSession()
  const [now, later] = enabledFollowUps(r, r.answers)
  const keys = [...now, ...later]
  const now_ = Date.now()
  const home: PatientHome = {
    role,
    language: r.visit.language,
    wait_estimate: { minutes: 287, source: 'ahs_feed', as_of: iso(now_ - 2 * 60_000) },
    waited_minutes: Math.max(0, Math.floor((now_ - Date.parse(r.visit.triaged_at)) / 60_000)),
    next_checkin_due_at: r.visit.next_prompt_due_at,
    questionnaire_version: bankVersion,
    items: keys.map((k) => questionItem(k, role)),
    // Patient only, never for a companion.
    attention_prompt: role === 'patient' ? currentPrompt(r, now_).prompt : null,
    message: 'none',
    // The level leaves the server only when the site shows it.
    triage_level: s.settings?.show_triage_level ? r.visit.ctas : null,
  }
  // currentPrompt stores a new prompt on the visit, so keep it for scoring.
  save(s)
  return home
}

export function submitReport(body: PatientReport): ReportReceipt {
  const { s, r, role } = requireSession()
  const fingerprint = JSON.stringify(body)
  const prior = s.submissions[body.submission_id]
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new MockError(409, 'Submission id reused with different content')
    return { ...prior.receipt, duplicate: true }
  }
  const now = Date.now()

  let attentionReason: 'attention_incorrect' | 'attention_unanswered' | null = null
  if (body.reporter !== role) throw new MockError(422, 'reporter must match the role chosen at sign-in')
  if (body.kind === 'checkin') {
    if (body.reporter === 'companion') {
      if (body.pain.kind !== 'missing') throw new MockError(422, 'pain is self-reported; a companion must send it as missing')
      if (body.attention.kind !== 'missing' || body.attention.prompt_id) {
        throw new MockError(422, 'the attention check is done by the patient; a companion sends it as missing with no prompt')
      }
    } else if (body.attention.prompt_id) {
      const p = r.prompts.find((x) => x.prompt.prompt_id === body.attention.prompt_id)
      if (!p) throw new MockError(422, 'That prompt does not belong to this visit')
      if (p.used) throw new MockError(409, 'That prompt was already answered')
      if (Date.parse(p.prompt.expires_at) <= now) throw new MockError(409, 'That prompt has expired')
      p.used = true
      // A wrong or missing count only asks staff for an in-person check. A missing answer with no prompt is not a missed check.
      if (body.attention.kind === 'answered') {
        if (body.attention.count !== p.expectedCount) attentionReason = 'attention_incorrect'
      } else {
        attentionReason = 'attention_unanswered'
      }
    }
  }

  const answersBefore = r.answers
  const [nowBefore] = enabledFollowUps(r, answersBefore)
  r.reports.push({ type: 'report', report_id: body.submission_id, visit_id: r.visit.visit_id, received_at: iso(now), report: body })

  const findings: FindingCode[] =
    body.kind === 'finding' ? body.findings : body.kind === 'checkin' && body.new_findings.kind === 'answered' ? body.new_findings.value : []
  const itemAnswers = body.kind === 'checkin' ? (body.items ?? {}) : {}
  r.answers = { ...answersBefore, ...rawAnswers(itemAnswers), ...(findings.length ? { new_findings: findings } : {}) }

  let level: TaskLevel | null = null
  let reasonCode = ''
  let routedTo: Task['routed_to'] = ['physician']
  let message: ReportReceipt['patient_message'] = 'none'

  if (body.kind === 'concern') {
    if (body.concern === 'desk_question') {
      // Non-clinical: goes to the triage nurse only. Task level is a mock assumption.
      level = 'overdue'
      reasonCode = 'concern_desk_question'
      routedTo = ['triage_nurse']
    } else {
      level = body.concern === 'help_now' ? 'red' : 'amber'
      reasonCode = `concern_${body.concern}`
    }
  }
  // Same weighting as api/src/recheck/rules.py: urgent signs are red on their own;
  // broad or already-known signs ask for review unless something corroborates them.
  const change = body.kind === 'checkin' && body.feeling_change.kind === 'answered' ? body.feeling_change.value : null
  const feelingNow = body.kind === 'checkin' && body.feeling_now.kind === 'answered' ? body.feeling_now.value : null
  if (findings.length > 0) {
    const known = KNOWN_AT_TRIAGE[r.visit.complaint_group] ?? []
    const urgent = findings.filter((f) => isUrgentFinding(f) && !known.includes(f))
    const review = findings.filter((f) => !urgent.includes(f))
    const corroborated = review.length >= 2 || (review.length === 1 && change === 'much_worse')
    level = urgent.length > 0 || corroborated ? 'red' : 'amber'
    reasonCode = `finding_${(urgent[0] ?? review[0])!}`
    routedTo = ['physician']
  } else if (change === 'much_worse') {
    level = feelingNow === 'very_poor' ? 'red' : 'amber'
    reasonCode = 'feeling_worse'
  } else if (change === 'worse' && !(feelingNow && ['ok', 'good', 'very_good'].includes(feelingNow))) {
    // A reassuring answer never cancels a check, so only worsening raises a level.
    level = 'amber'
    reasonCode = 'feeling_worse'
  }
  if (body.kind === 'leaving') {
    level = 'leave_risk'
    reasonCode = 'leaving'
    message = 'leaving_info'
  }
  if (level) {
    const had = r.task !== null
    const task = raise(r, level, reasonCode, 'report', body.submission_id, now, routedTo)
    if (message === 'none' && !(body.kind === 'concern' && body.concern === 'desk_question')) {
      message = had ? 'clinician_told' : 'clinician_will_check'
    }
    notify(r.visit.visit_id, 'task.changed', task.task_id)
  }
  if (attentionReason) {
    raise(r, 'overdue', attentionReason, 'report', body.submission_id, now)
    notify(r.visit.visit_id, 'task.changed')
  }
  if (body.kind === 'checkin' && !r.visit.app_exclusion) {
    // The patient timer restarts. The staff reassessment timer never moves.
    r.visit = { ...r.visit, next_prompt_due_at: iso(now + intervalOf(r.visit.ctas) * MIN) }
  }

  // Questions to ask next: newly enabled ones (dependent items, after-routing items).
  const [nowAfter, laterAfter] = enabledFollowUps(r, r.answers)
  const answeredNow = new Set(Object.keys(itemAnswers))
  const followUpKeys = [...nowAfter, ...laterAfter].filter((k) => !nowBefore.includes(k) && !answeredNow.has(k))

  const receipt: ReportReceipt = {
    submission_id: body.submission_id,
    received_at: iso(now),
    duplicate: false,
    patient_message: message,
    follow_up_items: followUpKeys,
  }
  s.submissions[body.submission_id] = { fingerprint, receipt }
  save(s)
  notify(r.visit.visit_id, 'report.received')
  return receipt
}

// Check-in reminders. The mocks send nothing, and the mock service worker holds
// the page's only service worker scope, so reminders are off in mock mode.
export function pushConfig(): PushConfig {
  requireSession()
  return { enabled: false, public_key: null }
}

export function savePushSubscription(): void {
  requireSession()
  throw new MockError(409, 'check-in reminders are off on this server')
}

export function endPushSubscription(): void {
  requireSession()
}
