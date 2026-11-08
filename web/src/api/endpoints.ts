// The backend contract defines request and response bodies but no HTTP paths.
// These paths are PROPOSED. Confirm them against the FastAPI routes when they
// exist; this is the only file that should change.
export const endpoints = {
  enrolVisit: () => '/api/visits',
  visitStatus: (visitId: string) => `/api/visits/${visitId}/status`,
  visitExclusion: (visitId: string) => `/api/visits/${visitId}/exclusion`,
  visitDetail: (visitId: string) => `/api/visits/${visitId}`,
  visitLink: (visitId: string) => `/api/visits/${visitId}/link`,
  staffSignOut: (visitId: string) => `/api/visits/${visitId}/sign-out`,
  vitals: (visitId: string) => `/api/visits/${visitId}/vitals`,
  flagHigher: (visitId: string) => `/api/visits/${visitId}/flag`,
  triageBoard: () => '/api/triage-board',
  siteSettings: () => '/api/site-settings',
  worklist: () => '/api/worklist',
  escalations: () => '/api/escalations',
  handover: () => '/api/handover',
  acknowledgeTask: (taskId: string) => `/api/tasks/${taskId}/acknowledge`,
  assessTask: (taskId: string) => `/api/tasks/${taskId}/assess`,
  staffSession: () => '/api/staff/session',
  staffSignInOptions: () => '/api/staff/sign-in-options',
  // Page navigations, not fetch calls: they redirect through Auth0.
  staffLogin: (returnTo: string) => `/api/staff/login?return_to=${encodeURIComponent(returnTo)}`,
  staffLogout: () => '/api/staff/logout',
  exchangeToken: () => '/api/session',
  signOut: () => '/api/session/sign-out',
  patientHome: () => '/api/patient/home',
  postReport: () => '/api/patient/reports',
} as const
