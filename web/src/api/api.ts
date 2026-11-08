import { request } from './client'
import { endpoints } from './endpoints'
import type {
  AcknowledgeTask,
  AssessTask,
  ChargeNurseView,
  FlagHigher,
  FlagRecord,
  Handover,
  PatientHome,
  PatientReport,
  PushConfig,
  PushSubscriptionSave,
  ReportReceipt,
  SessionInfo,
  SignOut,
  SiteSettings,
  SiteSettingsUpdate,
  StaffSignOut,
  Task,
  TokenExchange,
  TriageBoard,
  VisitCreate,
  VisitDetail,
  VisitEnrolled,
  VisitExclusionUpdate,
  VisitLink,
  VisitStatusUpdate,
  VitalsCreate,
  VitalsRecord,
  StaffRole,
  Worklist,
} from './types'

// Staff sign-in. These shapes come from api/src/recheck/routes/staff_session.py,
// which keeps them out of the shared contract.
export interface StaffSessionInfo {
  /** Auth0 user ID, or `demo|<role>` from the demo role picker. */
  user_id: string
  name: string | null
  role: StaffRole
  site_id: string
}
export interface SignInOptions {
  auth0: boolean
  demo: boolean
}

export const getStaffSession = () => request<StaffSessionInfo>('GET', endpoints.staffSession())
export const demoStaffSignIn = (role: StaffRole) => request<StaffSessionInfo>('POST', endpoints.staffSession(), { role })
export const clearStaffSession = () => request<undefined>('DELETE', endpoints.staffSession())
export const getSignInOptions = () => request<SignInOptions>('GET', endpoints.staffSignInOptions())

// Nurse
export const enrolVisit = (body: VisitCreate) => request<VisitEnrolled>('POST', endpoints.enrolVisit(), body)
export const getTriageBoard = () => request<TriageBoard>('GET', endpoints.triageBoard())
export const getSiteSettings = () => request<SiteSettings>('GET', endpoints.siteSettings())
export const updateSiteSettings = (body: SiteSettingsUpdate) =>
  request<SiteSettings>('PUT', endpoints.siteSettings(), body)
export const getWorklist = () => request<Worklist>('GET', endpoints.worklist())

// Charge nurse
export const getEscalations = () => request<ChargeNurseView>('GET', endpoints.escalations())
export const getHandover = () => request<Handover>('GET', endpoints.handover())
export const getVisitDetail = (id: string) => request<VisitDetail>('GET', endpoints.visitDetail(id))
export const postVitals = (body: VitalsCreate) => request<VitalsRecord>('POST', endpoints.vitals(body.visit_id), body)
export const postFlagHigher = (body: FlagHigher) => request<FlagRecord>('POST', endpoints.flagHigher(body.visit_id), body)
export const acknowledgeTask = (taskId: string, body: AcknowledgeTask) =>
  request<Task>('POST', endpoints.acknowledgeTask(taskId), body)
export const assessTask = (taskId: string, body: AssessTask) => request<Task>('POST', endpoints.assessTask(taskId), body)
export const updateVisitStatus = (visitId: string, body: VisitStatusUpdate) =>
  request<undefined>('POST', endpoints.visitStatus(visitId), body)

export const updateVisitExclusion = (visitId: string, body: VisitExclusionUpdate) =>
  request<undefined>('POST', endpoints.visitExclusion(visitId), body)
export const getVisitLink = (visitId: string) => request<VisitLink>('GET', endpoints.visitLink(visitId))
export const staffSignOut = (visitId: string, body: StaffSignOut) =>
  request<undefined>('POST', endpoints.staffSignOut(visitId), body)

// Patient and companion
export const exchangeToken = (body: TokenExchange) => request<SessionInfo>('POST', endpoints.exchangeToken(), body)
export const getPatientHome = () => request<PatientHome>('GET', endpoints.patientHome())
export const postReport = (body: PatientReport) => request<ReportReceipt>('POST', endpoints.postReport(), body)
export const signOut = (body: SignOut) => request<undefined>('POST', endpoints.signOut(), body)

// Check-in reminders by Web Push
export const getPushConfig = () => request<PushConfig>('GET', endpoints.pushConfig())
export const savePushSubscription = (body: PushSubscriptionSave) =>
  request<undefined>('PUT', endpoints.pushSubscription(), body)
export const endPushSubscription = () => request<undefined>('DELETE', endpoints.pushSubscription())
