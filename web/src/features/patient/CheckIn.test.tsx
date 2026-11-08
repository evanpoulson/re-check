import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { exchangeToken } from '@/api/api'
import { server } from '@/api/mocks/server'
import type { PatientReport } from '@/api/types'
import '@/i18n'
import { CheckIn } from './CheckIn'

async function openCheckIn(role: 'patient' | 'companion' = 'patient') {
  await exchangeToken({ token: 'demo-general-token', role })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CheckIn />
    </QueryClientProvider>,
  )
  return user
}

describe('urgent patient reporting', () => {
  it('tells the patient to get staff before the server replies, and retries a failed send with the same report', async () => {
    const bodies: PatientReport[] = []
    let fail!: () => void
    const gate = new Promise<void>((resolve) => { fail = resolve })
    server.use(http.post('*/api/patient/reports', async ({ request }) => {
      const body = await request.json() as PatientReport
      bodies.push(body)
      if (bodies.length === 1) {
        await gate
        return HttpResponse.json({ detail: 'try again' }, { status: 503 })
      }
      return HttpResponse.json({ submission_id: body.submission_id, received_at: new Date().toISOString(), duplicate: false, patient_message: 'clinician_told' })
    }))

    const user = await openCheckIn()
    await user.click(await screen.findByRole('button', { name: 'I need help now' }))
    expect(screen.getByRole('heading', { name: 'Tell a staff member now' })).toHaveFocus()
    expect(screen.queryByText('Your report was received.')).not.toBeInTheDocument()

    fail()
    await user.click(await screen.findByRole('button', { name: 'Try sending again' }))
    expect(await screen.findByText('Your report was received.')).toBeInTheDocument()
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toEqual(bodies[1])
  })
  it('sends a partial check-in from the warning-sign step instead of requiring remaining questions', async () => {
    let body: PatientReport | undefined
    server.use(http.post('*/api/patient/reports', async ({ request }) => {
      body = await request.json() as PatientReport
      return HttpResponse.json({ submission_id: body.submission_id, received_at: new Date().toISOString(), duplicate: false, patient_message: 'clinician_will_check' })
    }))
    const user = await openCheckIn('companion')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(screen.getByRole('button', { name: /^OK$/ }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'About the same' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Speech is different or hard to understand' }))
    await user.click(screen.getByRole('button', { name: 'Send warning signs now' }))
    expect(screen.getByRole('heading', { name: 'Tell a staff member now' })).toBeInTheDocument()
    await screen.findByText('Your report was received.')
    expect(body).toMatchObject({
      kind: 'checkin',
      reporter: 'companion',
      new_findings: { kind: 'answered', value: ['speech_change'] },
      pain: { kind: 'missing', reason: 'not_asked' },
    })
  })

})
