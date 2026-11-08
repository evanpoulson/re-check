import { request } from './client'
import { endpoints } from './endpoints'
import type {
  AcknowledgeTask,
  AssessTask,
  FlagHigher,
  FlagRecord,
  PatientHome,
  PatientReport,
  ReportReceipt,
  SessionInfo,
  SignOut,
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
  Worklist,
} from './types'

// Nurse
export const enrolVisit = (body: VisitCreate) => request<VisitEnrolled>('POST', endpoints.enrolVisit(), body)
export const getTriageBoard = () => request<TriageBoard>('GET', endpoints.triageBoard())
export const getWorklist = () => request<Worklist>('GET', endpoints.worklist())
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
