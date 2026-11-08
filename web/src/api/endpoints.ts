// The backend contract defines request and response bodies but no HTTP paths.
// These paths are PROPOSED. Confirm them against the FastAPI routes when they
// exist; this is the only file that should change.
export const endpoints = {
  enrolVisit: () => '/api/visits',
  visitStatus: (visitId: string) => `/api/visits/${visitId}/status`,
  visitDetail: (visitId: string) => `/api/visits/${visitId}`,
  vitals: (visitId: string) => `/api/visits/${visitId}/vitals`,
  flagHigher: (visitId: string) => `/api/visits/${visitId}/flag`,
  triageBoard: () => '/api/triage-board',
  worklist: () => '/api/worklist',
  acknowledgeTask: (taskId: string) => `/api/tasks/${taskId}/acknowledge`,
  assessTask: (taskId: string) => `/api/tasks/${taskId}/assess`,
  exchangeToken: () => '/api/session',
  patientHome: () => '/api/patient/home',
  postReport: () => '/api/patient/reports',
} as const
