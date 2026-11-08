import { http, HttpResponse } from 'msw'
import { endpoints } from '../endpoints'
import type {
  AcknowledgeTask,
  AssessTask,
  FlagHigher,
  PatientReport,
  TokenExchange,
  VisitCreate,
  VisitExclusionUpdate,
  VisitStatusUpdate,
  VitalsCreate,
} from '../types'
import * as store from './store'

// Paths come from endpoints.ts, so a path change there moves the mocks with it.
function reply<T>(fn: () => T, status = 200) {
  try {
    const out = fn()
    return out === undefined ? new HttpResponse(null, { status: 204 }) : HttpResponse.json(out as never, { status })
  } catch (e) {
    if (e instanceof store.MockError) return HttpResponse.json({ detail: e.message }, { status: e.status })
    throw e
  }
}

// Route params are plain segments, so match `:id` patterns derived from endpoints.
const withParam = (build: (p: string) => string) => build(':id')

export const handlers = [
  http.post(endpoints.enrolVisit(), async ({ request }) => {
    const body = (await request.json()) as VisitCreate
    return reply(() => store.enrol(body), 201)
  }),
  http.get(endpoints.triageBoard(), () => reply(() => store.triageBoard())),
  http.get(endpoints.worklist(), () => reply(() => store.worklist())),
  http.get(withParam(endpoints.visitDetail), ({ params }) => reply(() => store.visitDetail(String(params.id)))),
  http.post(withParam(endpoints.vitals), async ({ request }) => {
    const body = (await request.json()) as VitalsCreate
    return reply(() => store.recordVitals(body), 201)
  }),
  http.post(withParam(endpoints.flagHigher), async ({ request, params }) => {
    const body = (await request.json()) as FlagHigher
    return reply(() => store.flagHigher(String(params.id), body.note ?? null), 201)
  }),
  http.post(withParam(endpoints.visitStatus), async ({ request, params }) => {
    const body = (await request.json()) as VisitStatusUpdate
    return reply(() => store.setVisitStatus(String(params.id), body.status))
  }),
  http.post(withParam(endpoints.visitExclusion), async ({ request, params }) => {
    const body = (await request.json()) as VisitExclusionUpdate
    return reply(() => store.setExclusion(String(params.id), body.app_exclusion))
  }),
  http.post(withParam(endpoints.acknowledgeTask), async ({ request, params }) => {
    ;(await request.json()) as AcknowledgeTask
    return reply(() => store.acknowledge(String(params.id)))
  }),
  http.post(withParam(endpoints.assessTask), async ({ request, params }) => {
    const body = (await request.json()) as AssessTask
    return reply(() => store.assess(String(params.id), body.disposition))
  }),
  http.post(endpoints.exchangeToken(), async ({ request }) => {
    const body = (await request.json()) as TokenExchange
    return reply(() => store.exchange(body.token))
  }),
  http.get(endpoints.patientHome(), () => reply(() => store.patientHome())),
  http.post(endpoints.postReport(), async ({ request }) => {
    const body = (await request.json()) as PatientReport
    return reply(() => store.submitReport(body), 201)
  }),
]
