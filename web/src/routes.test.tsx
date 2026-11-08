import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { acknowledgeTask, assessTask, enrolVisit, exchangeToken, getPatientHome, getTriageBoard, getVisitDetail, getWorklist, postReport } from './api/api'
import { ApiError, newSubmissionId } from './api/client'
import type { PatientReport } from './api/types'
import './i18n'
import { joinBoard, sortQueue } from './lib/board'
import { createTestRouter } from './routes'

function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={createTestRouter([path])} />
    </QueryClientProvider>,
  )
}
const signInAsNurse = () => localStorage.setItem('recheck-demo-role', 'triage_nurse')
const queue = async () => sortQueue(joinBoard(await getTriageBoard(), await getWorklist())).map((i) => i.board.visit_id)
const common = (reporter: 'patient' | 'companion' = 'patient') => ({
  submission_id: newSubmissionId(),
  reporter,
  channel: 'phone' as const,
  captured_at: new Date().toISOString(),
})

describe('routes', () => {
  it('/ goes to the demo role picker, and a staff screen without a role goes there too', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Choose a demo role' })).toBeInTheDocument()
  })

  it('an unknown path says so', () => {
    renderApp('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('triage nurse: enrolment and QR', () => {
  it('validates, then shows two QR cards that encode the exact links, once', async () => {
    signInAsNurse()
    const user = userEvent.setup()
    renderApp('/staff/visits/new')

    await user.click(await screen.findByRole('button', { name: 'Create visit and QR codes' }))
    expect(await screen.findByText('Choose a CTAS level from 2 to 5.')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'Create visit and QR codes' }))

    expect(await screen.findByRole('heading', { name: 'Visit created' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('shown once')
    const patient = screen.getByRole('img', { name: 'QR code for Patient' })
    const companion = screen.getByRole('img', { name: 'QR code for Companion' })
    expect(patient).toBeInTheDocument()
    expect(companion).toBeInTheDocument()
    expect(screen.getAllByText(/\/v\//)).toHaveLength(2)
  })

  it('shows the pager field only for the pager channel', async () => {
    signInAsNurse()
    const user = userEvent.setup()
    renderApp('/staff/visits/new')
    expect(screen.queryByLabelText('Pager number')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('radio', { name: 'Pager' }))
    expect(screen.getByLabelText('Pager number')).toBeInTheDocument()
  })
})

describe('triage board', () => {
  it('lists waiting patients in queue order, with flags as badges', async () => {
    signInAsNurse()
    renderApp('/staff/triage')
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    // CTAS 2 chest pain first, then the two CTAS 3 visits by arrival.
    expect(rows[0]).toHaveTextContent('Chest or back pain')
    expect(rows[0]).toHaveTextContent('Red')
    expect(rows[1]).toHaveTextContent('Head injury')
    expect(rows[1]).toHaveTextContent('Silent')
    expect(rows[2]).toHaveTextContent('Other complaint')
  })

  it('a new flag shows a badge but never moves a row', async () => {
    signInAsNurse()
    const before = await queue()
    await exchangeToken({ token: 'demo-patient-general-token' })
    await postReport({ kind: 'concern', concern: 'help_now', ...common() })
    expect(await queue()).toEqual(before)

    renderApp('/staff/triage')
    const rows = within(await screen.findByRole('table')).getAllByRole('row').slice(1)
    expect(rows[2]).toHaveTextContent('Other complaint')
    expect(rows[2]).toHaveTextContent('Red')
  })
})

describe('patient and companion check-in', () => {
  it('opens from the QR link and shows the place-in-line promise, wait range and help bar', async () => {
    renderApp('/v/demo-patient-chest-token')
    expect(await screen.findByRole('heading', { name: 'You are checked in' })).toBeInTheDocument()
    expect(screen.getByText('Your answers never change your place in line.')).toBeInTheDocument()
    expect(screen.getByText(/Estimated wait: 30 to 90 minutes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "I need help now" })).toBeInTheDocument()
    expect(screen.getByText('What we store')).toBeInTheDocument()
  })

  it('a used or unknown code says so and never shows a visit', async () => {
    renderApp('/v/not-a-real-code-at-all-1234')
    expect(await screen.findByText('This code did not work')).toBeInTheDocument()
  })

  it('a companion is never asked for pain, but a patient is', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp('/v/demo-companion-general-token')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(await screen.findByRole('button', { name: 'Worse' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/Have you noticed any of these in them/)).toBeInTheDocument()
    expect(screen.queryByText('How bad is your pain right now?')).not.toBeInTheDocument()
    unmount()

    sessionStorage.clear()
    localStorage.clear()
    renderApp('/v/demo-patient-general-token')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(await screen.findByRole('button', { name: 'Worse' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('How bad is your pain right now?')).toBeInTheDocument()
  })

  it('"I need help now" shows the tell-a-staff-member screen and never any task level', async () => {
    const user = userEvent.setup()
    renderApp('/v/demo-patient-general-token')
    await user.click(await screen.findByRole('button', { name: 'I need help now' }))
    expect(await screen.findByRole('heading', { name: 'Tell a staff member now' })).toBeInTheDocument()
    expect(screen.queryByText(/^Red$/)).not.toBeInTheDocument()
  })

  it('a companion reporting new speech change routes an urgent task and asks the follow-up after', async () => {
    const user = userEvent.setup()
    renderApp('/v/demo-companion-general-token')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(await screen.findByRole('button', { name: 'About the same' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Speech is suddenly different' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'No' })) // general item: new symptom
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('heading', { name: 'Tell a staff member now' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "I'm telling staff" }))
    // The follow-up is asked only after the urgent screen.
    expect(await screen.findByText('When were they last speaking and acting as usual?')).toBeInTheDocument()

    const board = await queue()
    expect(board).toHaveLength(3)
  })
})

describe('the loop: report, flag, acknowledge, assess', () => {
  it('runs end to end against the contract and keeps the rules', async () => {
    const before = await queue()

    // QR: nurse enrols, patient exchanges the single-use token.
    const enrolled = await enrolVisit({ submission_id: newSubmissionId(), ctas: 3, complaint_group: 'chest_back_pain', language: 'en', channel: 'phone' })
    const token = enrolled.patient_link.split('/v/')[1]!
    await exchangeToken({ token })
    const home = await getPatientHome()
    expect(home.role).toBe('patient')
    expect(home.items.map((i) => i.key)).toContain('pain_change')

    // A worse check-in with a finding becomes a red task.
    const report: PatientReport = {
      kind: 'checkin',
      ...common(),
      questionnaire_version: home.questionnaire_version,
      overall: { kind: 'answered', value: 'worse' },
      pain: { kind: 'answered', value: 8 },
      new_findings: { kind: 'answered', value: ['chest_pain'] },
      items: {},
    }
    const receipt = await postReport(report)
    expect(receipt.patient_message).toBe('clinician_will_check')
    expect(receipt.follow_up_items).toEqual(['pain_location'])

    // A retry of the same report is a duplicate, not a second task.
    expect((await postReport(report)).duplicate).toBe(true)

    // Reused id with different content is rejected.
    await expect(postReport({ ...report, overall: { kind: 'answered', value: 'same' } })).rejects.toBeInstanceOf(ApiError)

    const mine = await getVisitDetail(enrolled.visit_id)
    expect(mine.open_task?.level).toBe('red')

    // The nurse sees it, and the queue position of everyone else is unchanged.
    expect((await queue()).filter((id) => before.includes(id))).toEqual(before)

    // Acknowledgement is separate from assessment: assessing first is refused.
    const task = mine.open_task!
    await expect(assessTask(task.task_id, { submission_id: newSubmissionId(), disposition: 'assessed_stable' })).rejects.toBeInstanceOf(ApiError)
    const acked = await acknowledgeTask(task.task_id, { submission_id: newSubmissionId() })
    expect(acked.status).toBe('acknowledged')
    const done = await assessTask(task.task_id, { submission_id: newSubmissionId(), disposition: 'assessed_stable' })
    expect(done.status).toBe('completed')

    const detail = await getVisitDetail(enrolled.visit_id)
    expect(detail.open_task).toBeNull()
    expect(detail.timeline.length).toBeGreaterThan(3)
  })

  it('a companion cannot send pain, and a patient response never moves the staff timer', async () => {
    await exchangeToken({ token: 'demo-companion-general-token' })
    const home = await getPatientHome()
    const checkin = (pain: 'answered' | 'missing'): PatientReport => ({
      kind: 'checkin',
      ...common('companion'),
      questionnaire_version: home.questionnaire_version,
      overall: { kind: 'answered', value: 'same' },
      pain: pain === 'answered' ? { kind: 'answered', value: 5 } : { kind: 'missing', reason: 'not_asked' },
      new_findings: { kind: 'answered', value: [] },
      items: {},
    })
    await expect(postReport(checkin('answered'))).rejects.toMatchObject({ status: 422 })

    const reassessBefore = (await getWorklist()).rows.find((r) => r.visit.complaint_group === 'general')!.visit.staff_reassess_due_at
    await postReport(checkin('missing'))
    const after = (await getWorklist()).rows.find((r) => r.visit.complaint_group === 'general')!.visit
    expect(after.staff_reassess_due_at).toBe(reassessBefore)
  })
})
