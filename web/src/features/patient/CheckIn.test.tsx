import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { exchangeToken } from '@/api/api'
import { server } from '@/api/mocks/server'
import { demoVisitId, makeCheckinDue } from '@/api/mocks/store'
import type { PatientReport } from '@/api/types'
import '@/i18n'
import { CheckIn } from './CheckIn'

async function openCheckIn(role: 'patient' | 'companion' = 'patient', { due = true } = {}) {
  if (due) makeCheckinDue(demoVisitId('general'))
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
  it('sends "I need help now" once, says when it failed, and confirms when it sends', async () => {
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
    const help = await screen.findByRole('button', { name: 'I need help now' })
    await user.click(help)
    // A second tap while the first is still sending does not send twice.
    await user.click(help)
    expect(bodies).toHaveLength(1)

    fail()
    // A failed send must never read as if staff already know.
    expect(await screen.findByText('That did not send. Please try again, or tell a staff member.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'I need help now' }))
    expect(await screen.findByRole('heading', { name: 'Thank you, we have your answers' })).toBeInTheDocument()
    expect(screen.getByText('We told a doctor or nurse.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Tell a staff member now/ })).not.toBeInTheDocument()
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toMatchObject({ kind: 'concern', concern: 'help_now' })
  })
  it('sends a partial check-in from the warning-sign step instead of requiring remaining questions', async () => {
    let body: PatientReport | undefined
    server.use(http.post('*/api/patient/reports', async ({ request }) => {
      body = await request.json() as PatientReport
      return HttpResponse.json({ submission_id: body.submission_id, received_at: new Date().toISOString(), duplicate: false, patient_message: 'clinician_will_check' })
    }))
    const user = await openCheckIn('companion')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(screen.getByRole('radio', { name: /^OK$/ }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    await user.click(screen.getByRole('radio', { name: 'About the same' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('checkbox', { name: 'Speech is different or hard to understand' }))
    await user.click(screen.getByRole('button', { name: 'Send to staff now' }))
    expect(await screen.findByRole('heading', { name: 'Thank you, we have your answers' })).toBeInTheDocument()
    expect(screen.getByText('A doctor or nurse will check on you.')).toBeInTheDocument()
    expect(body).toMatchObject({
      kind: 'checkin',
      reporter: 'companion',
      new_findings: { kind: 'answered', value: ['speech_change'] },
      pain: { kind: 'missing', reason: 'not_asked' },
    })
  })

})

describe('when a check-in is open', () => {
  it('shows no start button before the due time, but help and reporting a change stay available', async () => {
    const bodies: PatientReport[] = []
    server.use(http.post('*/api/patient/reports', async ({ request }) => {
      const body = await request.json() as PatientReport
      bodies.push(body)
      return HttpResponse.json({ submission_id: body.submission_id, received_at: new Date().toISOString(), duplicate: false, patient_message: 'clinician_will_check' })
    }))
    const user = await openCheckIn('patient', { due: false })
    expect(await screen.findByText(/^Not open yet\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start check-in' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tell us about a new symptom' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'I need help now' }))
    expect(await screen.findByRole('heading', { name: 'Thank you, we have your answers' })).toBeInTheDocument()
    expect(bodies).toEqual([expect.objectContaining({ kind: 'concern', concern: 'help_now' })])
  })

  it('opens the check-in once it is due', async () => {
    await openCheckIn('patient')
    expect(await screen.findByRole('button', { name: 'Start check-in' })).toBeInTheDocument()
    expect(screen.queryByText(/^Not open yet\./)).not.toBeInTheDocument()
  })
})
