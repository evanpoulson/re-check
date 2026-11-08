import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { exchangeToken } from '@/api/api'
import { endpoints } from '@/api/endpoints'
import { server } from '@/api/mocks/server'
import type { PatientReport } from '@/api/types'
import { flushOutbox, pendingCount, sendReport } from './outbox'

const concern = (id: string): PatientReport => ({
  kind: 'concern',
  concern: 'worried',
  submission_id: id,
  reporter: 'patient',
  channel: 'phone',
  captured_at: '2026-11-07T18:00:00.000Z',
})

describe('outbox', () => {
  it('saves a report when offline and retries the identical body, so the server sees one report', async () => {
    await exchangeToken({ token: 'demo-general-token', role: 'patient' })
    const sent: PatientReport[] = []
    server.use(http.post(endpoints.postReport(), () => HttpResponse.error()))

    const id = crypto.randomUUID()
    expect(await sendReport(concern(id))).toEqual({ queued: true })
    expect(await sendReport(concern(id))).toEqual({ queued: true }) // same id is not queued twice
    expect(pendingCount()).toBe(1)

    // Back online: record what arrives.
    server.resetHandlers()
    server.events.on('request:start', async ({ request }) => {
      if (request.url.endsWith(endpoints.postReport())) sent.push((await request.clone().json()) as PatientReport)
    })
    expect(await flushOutbox()).toBe(1)
    server.events.removeAllListeners()

    expect(pendingCount()).toBe(0)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.submission_id).toBe(id)
    expect(sent[0]).toEqual(concern(id))
  })

  it('keeps reports while the network is still down', async () => {
    await exchangeToken({ token: 'demo-general-token', role: 'patient' })
    server.use(http.post(endpoints.postReport(), () => HttpResponse.error()))
    await sendReport(concern(crypto.randomUUID()))
    expect(await flushOutbox()).toBe(0)
    expect(pendingCount()).toBe(1)
  })
})
