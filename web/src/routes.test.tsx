import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  acknowledgeTask,
  assessTask,
  enrolVisit,
  exchangeToken,
  getPatientHome,
  getStaffSession,
  getTriageBoard,
  getVisitDetail,
  getVisitLink,
  getWorklist,
  postReport,
  staffSignOut,
  updateVisitExclusion,
  updateVisitStatus,
} from './api/api'
import { translations } from './api/bank'
import { ApiError, newSubmissionId } from './api/client'
import { endpoints } from './api/endpoints'
import { server } from './api/mocks/server'
import type { CheckinReport, PatientReport } from './api/types'
import './i18n'
import esUi from './i18n/es.json'
import frUi from './i18n/fr.json'
import zhUi from './i18n/zh.json'
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
/** Open the visit's QR and say who is using the phone, as a person would. */
async function scanAs(ref: string, role: 'patient' | 'companion') {
  const user = userEvent.setup()
  renderApp(`/v/demo-${ref}-token`)
  await user.click(await screen.findByRole('button', { name: role === 'patient' ? "I'm the patient" : "I'm with the patient" }))
  return user
}
const signInAsNurse = () => sessionStorage.setItem('recheck-demo-role', 'triage_nurse')
const queue = async () => sortQueue(joinBoard(await getTriageBoard(), await getWorklist())).map((i) => i.board.visit_id)
const common = (reporter: 'patient' | 'companion' = 'patient') => ({
  submission_id: newSubmissionId(),
  reporter,
  channel: 'phone' as const,
  captured_at: new Date().toISOString(),
})
const visitWhere = async (pred: (r: Awaited<ReturnType<typeof getWorklist>>['rows'][number]) => boolean) =>
  (await getWorklist()).rows.find(pred)!.visit

function checkin(over: Partial<CheckinReport> & Pick<CheckinReport, 'reporter'>, version: string): PatientReport {
  const companion = over.reporter === 'companion'
  return {
    kind: 'checkin',
    submission_id: newSubmissionId(),
    channel: 'phone',
    captured_at: new Date().toISOString(),
    questionnaire_version: version,
    feeling_now: { kind: 'answered', value: 'ok' },
    feeling_change: { kind: 'answered', value: 'same' },
    pain: companion ? { kind: 'missing', reason: 'not_asked' } : { kind: 'answered', value: 3 },
    new_findings: { kind: 'answered', value: [] },
    attention: { kind: 'missing', reason: 'not_asked' },
    items: {},
    ...over,
  }
}

describe('routes', () => {
  it('/ goes to staff sign-in', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument()
  })

  it('an unknown path says so', () => {
    renderApp('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('staff sign-in', () => {
  it('a signed-out staff page goes to sign-in', async () => {
    renderApp('/staff/triage')
    expect(await screen.findByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument()
  })

  it('the demo picker signs in through the server session and opens the role home', async () => {
    const user = userEvent.setup()
    renderApp('/staff/sign-in')
    expect(screen.queryByRole('button', { name: /^Sign in/ })).not.toBeInTheDocument() // mocks have no Auth0
    await user.click(await screen.findByRole('button', { name: 'Physician' }))
    expect(await screen.findByRole('link', { name: /Physician worklist/ })).toBeInTheDocument()
    expect(await getStaffSession()).toMatchObject({ user_id: 'demo|physician', role: 'physician' })
  })

  it('a charge nurse can open both the triage board and the worklist', async () => {
    sessionStorage.setItem('recheck-demo-role', 'charge_nurse')
    renderApp('/staff/physician')
    const nav = await screen.findByRole('navigation', { name: 'Staff' })
    expect(within(nav).getByRole('link', { name: /Triage board/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /New visit/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Physician worklist/ })).toBeInTheDocument()
  })

  it('signing out clears the server session', async () => {
    signInAsNurse()
    const user = userEvent.setup()
    renderApp('/staff/triage')
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    // The sign-in page can re-render once while the session clears, so query the live DOM each time.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Staff sign-in' })).toBeInTheDocument())
    await expect(getStaffSession()).rejects.toMatchObject({ status: 401 })
  })

  it('shows the Auth0 button when the server offers it, and explains a refused account', async () => {
    server.use(http.get(endpoints.staffSignInOptions(), () => HttpResponse.json({ auth0: true, demo: false })))
    renderApp('/staff/sign-in?error=access_denied')
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("isn't on the Recheck staff list")
    expect(screen.queryByRole('button', { name: 'Triage nurse' })).not.toBeInTheDocument()
  })

  it('shows an Auth0 error instead of redirecting to an old demo session', async () => {
    signInAsNurse()
    renderApp('/staff/sign-in?error=no_staff_role')
    expect(await screen.findByRole('alert')).toHaveTextContent('has no Recheck staff role')
    expect(screen.getByRole('heading', { name: 'Demo roles' })).toBeInTheDocument()
    await waitFor(() => expect(getStaffSession()).rejects.toMatchObject({ status: 401 }))
  })

  it('names each staff page in the tab title', async () => {
    signInAsNurse()
    renderApp('/staff/triage')
    await screen.findByRole('heading', { name: 'Triage board' })
    expect(document.title).toBe('Triage board – Recheck')
  })
})

describe('charge nurse', () => {
  const signInAsCharge = () => sessionStorage.setItem('recheck-demo-role', 'charge_nurse')

  it('starts on escalations, where the unacknowledged urgent task has reached the backup', async () => {
    signInAsCharge()
    renderApp('/staff/sign-in')
    expect(await screen.findByRole('heading', { level: 1, name: 'Escalations' })).toBeInTheDocument()
    const nav = await screen.findByRole('navigation', { name: 'Staff' })
    expect(within(nav).getAllByRole('link')[0]).toHaveTextContent('Escalations')
    const list = await screen.findByRole('list', { name: 'Escalated and routed tasks' })
    const row = within(list).getByRole('link', { name: /New chest pain reported/ })
    expect(row).toHaveTextContent('Routed to backup')
    expect(row).toHaveTextContent('Physician, Charge nurse')
    expect(document.title).toBe('Escalations – Recheck')
  })

  it('shows the handover: shift, ranked patients, open tasks and overdue reassessments', async () => {
    signInAsCharge()
    const user = userEvent.setup()
    renderApp('/staff/escalations')
    await user.click(await screen.findByRole('link', { name: 'Handover' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Handover' })).toBeInTheDocument()
    expect(screen.getByText(/^Shift /)).toBeInTheDocument()
    const patients = screen.getByRole('list', { name: 'Waiting patients' })
    // The escalated red task is past its acknowledgement deadline, so its patient row says so.
    expect(within(patients).getAllByRole('link')[0]).toHaveTextContent(/#1.*Acknowledgement (due now|\d+ min overdue)/)
    expect(screen.getByRole('list', { name: 'Open tasks' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Overdue staff reassessments/ })).toBeInTheDocument()
  })

  it('may acknowledge, record vitals and manage the visit, but not flag higher (the API is triage nurse only)', async () => {
    signInAsCharge()
    const visit = await visitWhere((r) => r.open_task?.level === 'red')
    const user = userEvent.setup()
    renderApp(`/staff/visits/${visit.visit_id}/assessment`)
    expect(await screen.findByRole('link', { name: 'Back to escalations' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Visit management' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Flag higher/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(async () =>
      expect((await getVisitDetail(visit.visit_id)).open_task).toMatchObject({ status: 'acknowledged', acknowledged_by: { role: 'charge_nurse' } }),
    )
  })

  it('other roles have no escalations page', async () => {
    sessionStorage.setItem('recheck-demo-role', 'physician')
    renderApp('/staff/escalations')
    expect(await screen.findByRole('heading', { level: 1, name: 'Physician worklist' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Escalations/ })).not.toBeInTheDocument()
  })
})

describe('triage nurse: enrolment and QR', () => {
  it('validates, then shows one QR card that encodes the exact link, and Show QR brings it back', async () => {
    signInAsNurse()
    const user = userEvent.setup()
    renderApp('/staff/visits/new')

    await user.click(await screen.findByRole('button', { name: 'Create visit and QR code' }))
    // GOV.UK error summary at the top, linked to the field, plus the inline error.
    expect(await screen.findByRole('heading', { name: 'There is a problem' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose a CTAS level from 2 to 5.' })).toHaveAttribute('href', '#ctas-2')
    expect(screen.getAllByText('Choose a CTAS level from 2 to 5.')).toHaveLength(2)
    expect(document.title).toBe('Error: New visit – Recheck')

    await user.click(screen.getByRole('radio', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'Create visit and QR code' }))

    expect(await screen.findByRole('heading', { name: 'Visit created' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR code for Check-in code' })).toBeInTheDocument()
    const links = screen.getAllByText(/\/v\//)
    expect(links).toHaveLength(1)
    expect(screen.getByText(/show it again from the visit/)).toBeInTheDocument()
  })

  it('the visit shows who is signed in and can show the same QR again', async () => {
    signInAsNurse()
    const visit = await visitWhere((r) => r.visit.complaint_group === 'confused_drowsy')
    const user = userEvent.setup()
    renderApp(`/staff/visits/${visit.visit_id}/manage`)
    expect(await screen.findAllByText(/Companion signed in since/)).toHaveLength(1) // once, beside the sign-out action
    const show = screen.getByRole('button', { name: 'Show QR' })
    expect(show).toHaveAttribute('aria-expanded', 'false')
    await user.click(show)
    expect(await screen.findByRole('img', { name: 'QR code for Check-in code' })).toBeInTheDocument()
    expect(screen.getByText(/\/v\/demo-confused-token$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show QR' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out the phone' }))
    expect(await screen.findAllByText('No one signed in')).toHaveLength(1)
  })

  it('splits the visit into four pages and keeps the concern and both clocks on each', async () => {
    signInAsNurse()
    const visit = await visitWhere((r) => r.open_task?.level === 'red')
    const user = userEvent.setup()
    renderApp(`/staff/visits/${visit.visit_id}`)
    const tabs = await screen.findByRole('navigation', { name: 'Visit pages' })
    const pages = [
      ['Overview', "What's changed"],
      ['Assessment', 'Assessment disposition'],
      ['Timeline', 'Review task status'],
      ['Visit management', 'Stop offering the app'],
    ] as const
    for (const [tab, section] of pages) {
      await user.click(within(tabs).getByRole('link', { name: tab }))
      expect(within(tabs).getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page')
      expect(await screen.findByRole('heading', { name: section })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'New chest pain reported' })).toBeInTheDocument()
      expect(screen.getByText('Staff reassessment due')).toBeInTheDocument()
      expect(screen.getByText('Patient check-in due')).toBeInTheDocument()
    }
  })

  it('lets the triage nurse acknowledge an urgent report routed to the physician, from the overview', async () => {
    signInAsNurse()
    const visit = await visitWhere((r) => r.open_task?.level === 'red')
    expect((await getVisitDetail(visit.visit_id)).open_task?.routed_to).not.toContain('triage_nurse')
    const user = userEvent.setup()
    renderApp(`/staff/visits/${visit.visit_id}`)
    await user.click(await screen.findByRole('button', { name: 'Acknowledge' }))
    expect(await screen.findAllByText(/^Acknowledged \d/)).toHaveLength(2) // banner and card
    const task = (await getVisitDetail(visit.visit_id)).open_task!
    expect(task).toMatchObject({ status: 'acknowledged', acknowledged_by: { role: 'triage_nurse' } })
  })

  it('will not stop the app until a reason is chosen and the change is confirmed', async () => {
    signInAsNurse()
    const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)
    const user = userEvent.setup()
    renderApp(`/staff/visits/${visit.visit_id}/manage`)
    const stop = await screen.findByRole('button', { name: 'Stop offering the app' })
    const confirm = screen.getByRole('checkbox', { name: 'I understand this cannot be undone.' })
    // The button stays enabled and says what is missing on press.
    await user.click(stop)
    expect(await screen.findByText('Choose a reason for stopping the app.')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Major trauma' }))
    await user.click(stop)
    expect(await screen.findByText('Confirm that you understand this cannot be undone.')).toBeInTheDocument()
    expect(confirm).toHaveFocus()
    expect((await getVisitDetail(visit.visit_id)).visit.app_exclusion).toBeNull()
    await user.click(confirm)
    await user.click(stop)
    expect(await screen.findAllByText('Not offered: Major trauma')).not.toHaveLength(0)
    expect((await getVisitDetail(visit.visit_id)).visit.app_exclusion).toBe('major_trauma')
  })

  it('shows the pager field only for the pager channel', async () => {
    signInAsNurse()
    const user = userEvent.setup()
    renderApp('/staff/visits/new')
    expect(screen.queryByLabelText('Pager number')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('radio', { name: 'Pager' }))
    expect(screen.getByLabelText('Pager number')).toBeInTheDocument()
  })

  it('a CEDIS code from the backend map locks the complaint group', async () => {
    signInAsNurse()
    const user = userEvent.setup()
    renderApp('/staff/visits/new')
    await user.type(await screen.findByLabelText(/CEDIS code/), '402')
    expect(screen.getByLabelText('Presenting complaint')).toHaveValue('confused_drowsy')
    expect(screen.getByLabelText('Presenting complaint')).toBeDisabled()
    expect(screen.getByText('Set by the CEDIS code.')).toBeInTheDocument()
  })

  it('the CEDIS combobox searches by name and picks with the keyboard', async () => {
    signInAsNurse()
    const user = userEvent.setup()
    renderApp('/staff/visits/new')
    const box = await screen.findByRole('combobox', { name: /CEDIS code/ })
    await user.type(box, 'chest pain (card')
    expect(box).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: /Chest pain \(cardiac features\)/ })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Enter}')
    expect(box).toHaveValue('003')
    expect(box).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Presenting complaint')).toHaveValue('chest_back_pain')
    expect(screen.queryByRole('heading', { name: 'Visit created' })).not.toBeInTheDocument()
  })

  it('an excluded complaint pre-selects the exclusion, hides the channel and issues no QR', async () => {
    signInAsNurse()
    const user = userEvent.setup()
    renderApp('/staff/visits/new')
    await user.type(await screen.findByLabelText(/CEDIS code/), '609')
    expect(screen.getByLabelText('Patient app')).toHaveValue('child')
    expect(screen.queryByRole('radio', { name: 'Pager' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '4' }))
    await user.click(screen.getByRole('button', { name: 'Create visit (no QR)' }))
    expect(await screen.findByText(/No QR issued: Child/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /QR code/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument()
  })
})

describe('triage board', () => {
  it('lists waiting patients in queue order with a place-in-line numeral and flags as badges', async () => {
    signInAsNurse()
    renderApp('/staff/triage')
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5)
    // CTAS 2 first, then CTAS 3 by arrival, then CTAS 4.
    const order = ['Chest or back pain', 'Head injury', 'Other complaint', 'Confused or drowsy', 'Other complaint']
    rows.forEach((r, i) => {
      expect(r).toHaveTextContent(order[i]!)
      expect(within(r).getByRole('rowheader')).toHaveTextContent(String(i + 1))
    })
    expect(rows[0]).toHaveTextContent('Red')
    expect(rows[1]).toHaveTextContent('Silent')
  })

  it('an excluded patient shows "App not offered", not applicable for check-ins, and is never "No response"', async () => {
    signInAsNurse()
    renderApp('/staff/triage')
    const rows = within(await screen.findByRole('table')).getAllByRole('row').slice(1)
    const child = rows[4]!
    expect(child).toHaveTextContent(/App not offered\s*Child/)
    expect(child).toHaveTextContent('Not applicable')
    expect(child).not.toHaveTextContent('No response')
  })

  it('a new flag shows a badge but never moves a row or its numeral', async () => {
    signInAsNurse()
    const before = await queue()
    await exchangeToken({ token: 'demo-general-token', role: 'patient' })
    await postReport({ kind: 'concern', concern: 'help_now', ...common() })
    expect(await queue()).toEqual(before)

    renderApp('/staff/triage')
    const rows = within(await screen.findByRole('table')).getAllByRole('row').slice(1)
    expect(rows[2]).toHaveTextContent('Other complaint')
    expect(rows[2]).toHaveTextContent('Red')
    expect(within(rows[2]!).getByRole('rowheader')).toHaveTextContent('3')
  })
})

describe('patient and companion check-in', () => {
  it('opens from the QR link and shows the place-in-line promise, department estimate and time waited', async () => {
    await scanAs('chest', 'patient')
    expect(await screen.findByRole('heading', { name: 'Waiting room check-ins' })).toBeInTheDocument()
    expect(screen.getByText(/The sickest people are seen first\./)).toBeInTheDocument()
    expect(screen.getByText('AHS estimate')).toBeInTheDocument()
    expect(screen.getByText(/^about 4 to 5 hours from triage to seeing a doctor, for less urgent patients/)).toBeInTheDocument()
    expect(screen.getByText(/^Not your personal wait\./)).toBeInTheDocument()
    expect(screen.getByText("You've waited since triage")).toBeInTheDocument()
    expect(screen.getByText('What we store')).toBeInTheDocument()
  })

  it('shows the wait, "How triage works" and "What we store" on Home only, and the place-in-line promise everywhere', async () => {
    const user = await scanAs('chest', 'patient')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await screen.findByRole('heading', { name: 'How are you feeling right now?' })
    expect(screen.getByText(/The sickest people are seen first\./)).toBeInTheDocument()
    expect(screen.queryByText('AHS estimate')).not.toBeInTheDocument()
    expect(screen.queryByText('How triage works')).not.toBeInTheDocument()
    expect(screen.queryByText('What we store')).not.toBeInTheDocument()
  })

  it('shows all four always-visible buttons from the question bank', async () => {
    await scanAs('chest', 'patient')
    await screen.findByRole('heading', { name: 'Waiting room check-ins' })
    for (const name of ['I need help now', "I'm worried I'm getting worse", 'Question about my wait or care', "I'm leaving"]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('uses the bank\'s companion wording on the buttons for a companion', async () => {
    await scanAs('general', 'companion')
    await screen.findByRole('heading', { name: "You're answering for someone you're with" })
    expect(screen.getByRole('button', { name: 'They need help now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'The patient is leaving' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tell us about something new you notice' })).toBeInTheDocument()
  })

  it('asks a companion whether the patient is leaving, and keeps the safety advice', async () => {
    const user = await scanAs('general', 'companion')
    await user.click(await screen.findByRole('button', { name: 'The patient is leaving' }))
    expect(await screen.findByRole('heading', { name: 'Is the patient leaving?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "No, they're staying" })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "Yes, they're leaving" }))
    expect(await screen.findByText(/Please tell staff before the patient leaves\..*call 911.*call 811/)).toBeInTheDocument()
  })

  it('keeps a language picked before signing in instead of the visit\'s', async () => {
    const user = userEvent.setup()
    renderApp('/v/demo-chest-token')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Language' }), 'fr')
    await user.click(await screen.findByRole('button', { name: frUi.exchange.role.patient }))
    expect(await screen.findByRole('heading', { name: frUi.patient.homeTitle })).toBeInTheDocument()
  })

  it('uses the visit\'s language when nobody picked one on this phone', async () => {
    signInAsNurse()
    const enrolled = await enrolVisit({ submission_id: newSubmissionId(), ctas: 3, complaint_group: 'chest_back_pain', cedis_code: '003', language: 'es', channel: 'phone' })
    const user = userEvent.setup()
    renderApp(`/v/${enrolled.link!.split('/v/')[1]!}`)
    await user.click(await screen.findByRole('button', { name: "I'm the patient" }))
    expect(await screen.findByRole('heading', { name: esUi.patient.homeTitle })).toBeInTheDocument()
  })

  it('a bad code says so and never shows a visit', async () => {
    renderApp('/v/not-a-real-code-at-all-1234')
    await userEvent.setup().click(await screen.findByRole('button', { name: "I'm the patient" }))
    expect(await screen.findByRole('heading', { name: 'This code no longer works' })).toBeInTheDocument()
    expect(screen.getByText('Please ask a staff member for a new code.')).toBeInTheDocument()
  })

  it('a code for a closed visit is no longer active', async () => {
    const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)
    await updateVisitStatus(visit.visit_id, { submission_id: newSubmissionId(), status: 'roomed' })
    await expect(exchangeToken({ token: 'demo-general-token', role: 'patient' })).rejects.toMatchObject({ status: 410 })
  })

  it('a second phone must confirm before it signs out the first, and the first is then signed out', async () => {
    // The seeded confused visit already has a companion's phone signed in.
    const user = userEvent.setup()
    renderApp('/v/demo-confused-token')
    await user.click(await screen.findByRole('button', { name: "I'm the patient" }))
    expect(await screen.findByRole('heading', { name: 'Another phone is already signed in' })).toBeInTheDocument()
    expect(screen.getByText(/Someone with the patient signed in on another phone/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use this phone instead' }))
    expect(await screen.findByRole('heading', { name: 'Waiting room check-ins' })).toBeInTheDocument()

    const visit = await visitWhere((r) => r.visit.complaint_group === 'confused_drowsy')
    expect(visit.signed_in_as).toBe('patient')
    const sessions = (await getVisitDetail(visit.visit_id)).timeline.filter((e) => 'session_id' in e)
    expect(sessions).toEqual([
      expect.objectContaining({ role: 'companion', end_reason: 'takeover' }),
      expect.objectContaining({ role: 'patient', end_reason: null, replaces: (sessions[0] as { session_id: string }).session_id }),
    ])
  })

  it('a takeover needs the session from the 409, and a stale one is refused with the current state', async () => {
    const err = await exchangeToken({ token: 'demo-confused-token', role: 'patient' }).catch((e: ApiError) => e)
    expect(err).toMatchObject({ status: 409, body: { signed_in_as: 'companion' } })
    await expect(
      exchangeToken({ token: 'demo-confused-token', role: 'patient', takeover_session_id: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 409 })
    const ok = await exchangeToken({
      token: 'demo-confused-token',
      role: 'patient',
      takeover_session_id: (err as ApiError & { body: { session_id: string } }).body.session_id,
    })
    expect(ok.replaced_other_device).toBe(true)
  })

  it('a reporter must match the role chosen at sign-in', async () => {
    await exchangeToken({ token: 'demo-general-token', role: 'patient' })
    await expect(postReport({ kind: 'concern', concern: 'worried', ...common('companion') })).rejects.toMatchObject({ status: 422 })
  })

  it('signing out, or staff signing the phone out, stops the device from sending', async () => {
    const user = await scanAs('general', 'patient')
    await user.click(await screen.findByRole('button', { name: 'Sign out of this phone' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: "You've been signed out" })).toBeInTheDocument()
    expect(screen.getByText(/To sign in again, scan the visit's QR code/)).toBeInTheDocument()
    await expect(postReport({ kind: 'concern', concern: 'help_now', ...common() })).rejects.toMatchObject({ status: 401 })

    await exchangeToken({ token: 'demo-general-token', role: 'companion' })
    const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)
    await staffSignOut(visit.visit_id, { submission_id: newSubmissionId() })
    await expect(getPatientHome()).rejects.toMatchObject({ status: 401 })
    expect((await getVisitDetail(visit.visit_id)).visit.signed_in_as).toBeNull()
  })

  it('the question to the desk goes to the triage nurse and never shows the urgent screen', async () => {
    const user = userEvent.setup()
    await scanAs('general', 'patient')
    await user.click(await screen.findByRole('button', { name: 'Question about my wait or care' }))
    // A stray tap must not make a nurse task: it asks first, and Cancel sends nothing.
    expect(await screen.findByRole('heading', { name: 'Send a question to the triage nurse?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await screen.findByRole('heading', { name: 'Waiting room check-ins' })
    await user.click(screen.getByRole('button', { name: 'Question about my wait or care' }))
    await user.click(await screen.findByRole('button', { name: 'Yes, send my question' }))
    expect(await screen.findByRole('heading', { name: 'Your question went to the triage nurse' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to home' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Tell a staff member now/ })).not.toBeInTheDocument()
  })

  it('a new symptom report has Back at the top and says what is missing instead of a disabled Send', async () => {
    const user = await scanAs('chest', 'patient')
    await user.click(await screen.findByRole('button', { name: 'Tell us about a new symptom' }))
    const send = await screen.findByRole('button', { name: 'Send to staff' })
    expect(send).toBeEnabled()
    await user.click(send)
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose at least one change, or go back.')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Waiting room check-ins' })).toBeInTheDocument()
  })

  it('"I need help now" confirms the report was sent and never shows any task level', async () => {
    const user = userEvent.setup()
    await scanAs('general', 'patient')
    await user.click(await screen.findByRole('button', { name: 'I need help now' }))
    expect(await screen.findByRole('heading', { name: 'Thank you, we have your answers' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Tell a staff member now/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Red$/)).not.toBeInTheDocument()
  })

  it('a companion is never asked for pain or the circle check', async () => {
    const user = userEvent.setup()
    await scanAs('general', 'companion')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    expect(await screen.findByRole('heading', { name: 'How do they seem right now?' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Good' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('radio', { name: 'About the same' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    // The next question is the warning signs, not pain.
    expect(await screen.findByRole('heading', { name: /Since they arrived, have you noticed any of this/ })).toBeInTheDocument()
    expect(screen.queryByText(/How bad is your pain/)).not.toBeInTheDocument()
    // It is the last step for the general group, so there is no circle check either.
    expect(screen.getByRole('button', { name: 'Send to staff' })).toBeInTheDocument()
  })

  it('a patient is asked for pain, then the circle check, and "I can\'t do this" still names the prompt', async () => {
    const user = userEvent.setup()
    await scanAs('general', 'patient')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(await screen.findByRole('radio', { name: 'Good' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('radio', { name: 'About the same' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/How bad is your pain right now/)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('checkbox', { name: 'None of these' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('heading', { name: /Count the circles/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "I can't do this" }))
    expect(await screen.findByRole('heading', { name: 'Thank you, we have your answers' })).toBeInTheDocument()

    // Staff see "shown but not answered", which is not "not shown".
    const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)
    const detail = await getVisitDetail(visit.visit_id)
    const last = [...detail.timeline].reverse().find((e) => 'report_id' in e && e.report.kind === 'checkin') as { report: CheckinReport }
    expect(last.report.attention).toMatchObject({ kind: 'missing', reason: 'unable_to_respond', prompt_id: expect.any(String) })
    expect(detail.open_task?.reasons.map((r) => r.reason_code)).toContain('attention_unanswered')
  })

  it('a companion reporting new speech change routes an urgent task and asks the follow-up after', async () => {
    const user = userEvent.setup()
    await scanAs('general', 'companion')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(await screen.findByRole('radio', { name: 'Good' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('radio', { name: 'About the same' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Speech is different or hard to understand' }))
    await user.click(screen.getByRole('button', { name: 'Send to staff now' }))

    expect(await screen.findByRole('heading', { name: 'Thank you, we have your answers' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Answer 1 more question' }))
    // The follow-up is optional and asked only after the report is sent, in the companion wording.
    expect(await screen.findByRole('heading', { name: 'When were they last speaking and moving as usual?' })).toBeInTheDocument()
  })

  it('shows an English-only notice for other languages until translations exist', async () => {
    const user = userEvent.setup()
    await scanAs('chest', 'patient')
    await screen.findByRole('heading', { name: 'Waiting room check-ins' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'zh')
    expect(await screen.findByRole('note')).toHaveTextContent(zhUi.patient.languageNotice)
  })

  it('asks the check-in questions in the language the patient picks', async () => {
    const user = userEvent.setup()
    await scanAs('chest', 'patient')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    expect(await screen.findByRole('heading', { name: 'How are you feeling right now?' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'zh')
    expect(await screen.findByRole('heading', { name: translations.zh!.items.feeling_now!.text })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: translations.zh!.items.feeling_now!.options!.good })).toBeInTheDocument()
  })

  it('switches the page to right to left for Arabic and back for English', async () => {
    const user = userEvent.setup()
    await scanAs('chest', 'patient')
    await screen.findByRole('heading', { name: 'Waiting room check-ins' })
    const picker = screen.getByRole('combobox', { name: 'Language' })
    await user.selectOptions(picker, 'ar')
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    expect(document.documentElement).toHaveAttribute('lang', 'ar')
    await user.selectOptions(picker, 'en')
    expect(document.documentElement).toHaveAttribute('dir', 'ltr')
  })
})

describe('the loop and the backend rules', () => {
  it('runs enrol, scan, report, flag, acknowledge, assess against the contract', async () => {
    const before = await queue()
    const enrolled = await enrolVisit({ submission_id: newSubmissionId(), ctas: 3, complaint_group: 'chest_back_pain', cedis_code: '003', language: 'en', channel: 'phone' })
    expect(enrolled.link).toBeTruthy()
    // The desk can show the same code again.
    expect((await getVisitLink(enrolled.visit_id)).link).toBe(enrolled.link)
    await exchangeToken({ token: enrolled.link!.split('/v/')[1]!, role: 'patient' })
    const home = await getPatientHome()
    expect(home.role).toBe('patient')
    expect(home.items.map((i) => i.key)).toEqual(['pain_moved', 'pain_sudden_worse'])
    expect(home.attention_prompt).not.toBeNull()

    const report = checkin(
      { reporter: 'patient', feeling_change: { kind: 'answered', value: 'worse' }, new_findings: { kind: 'answered', value: ['chest_pain'] }, items: { pain_moved: { kind: 'yes_no', value: true } } },
      home.questionnaire_version,
    )
    const receipt = await postReport(report)
    expect(receipt.patient_message).toBe('clinician_will_check')
    // The dependent and after-routing questions arrive on the receipt, as the bank's enableWhen says.
    expect(receipt.follow_up_items).toEqual(expect.arrayContaining(['pain_new_location', 'change_started']))
    expect((await postReport(report)).duplicate).toBe(true)
    await expect(postReport({ ...(report as CheckinReport), pain: { kind: 'answered', value: 9 } })).rejects.toBeInstanceOf(ApiError)

    const mine = await getVisitDetail(enrolled.visit_id)
    expect(mine.open_task?.level).toBe('red')
    expect((await queue()).filter((id) => before.includes(id))).toEqual(before)

    const task = mine.open_task!
    await expect(assessTask(task.task_id, { submission_id: newSubmissionId(), disposition: 'assessed_stable' })).rejects.toBeInstanceOf(ApiError)
    expect((await acknowledgeTask(task.task_id, { submission_id: newSubmissionId() })).status).toBe('acknowledged')
    expect((await assessTask(task.task_id, { submission_id: newSubmissionId(), disposition: 'assessed_stable' })).status).toBe('completed')
    expect((await getVisitDetail(enrolled.visit_id)).open_task).toBeNull()
  })

  it('a "same" answer never cancels or raises a task, and "much worse" raises red', async () => {
    await exchangeToken({ token: 'demo-general-token', role: 'patient' })
    const home = await getPatientHome()
    const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)
    await postReport(checkin({ reporter: 'patient', feeling_change: { kind: 'answered', value: 'better' } }, home.questionnaire_version))
    expect((await getVisitDetail(visit.visit_id)).open_task).toBeNull()
    await postReport(checkin({ reporter: 'patient', feeling_change: { kind: 'answered', value: 'much_worse' } }, home.questionnaire_version))
    expect((await getVisitDetail(visit.visit_id)).open_task?.level).toBe('red')
  })

  describe('the circle check', () => {
    it('a patient gets a prompt and a companion never does', async () => {
      await exchangeToken({ token: 'demo-general-token', role: 'patient' })
      const p = (await getPatientHome()).attention_prompt!
      expect(p.steps.length).toBeGreaterThanOrEqual(6)
      expect(p.show_ms).toBeGreaterThanOrEqual(200)
      expect((await getPatientHome()).attention_prompt!.prompt_id).toBe(p.prompt_id) // stable across refetches

      await exchangeToken({ token: 'demo-general-token', role: 'companion' })
      expect((await getPatientHome()).attention_prompt).toBeNull()
    })

    it('a wrong count opens a non-urgent check; a prompt is single use', async () => {
      await exchangeToken({ token: 'demo-general-token', role: 'patient' })
      const home = await getPatientHome()
      const prompt = home.attention_prompt!
      const circles = prompt.steps.filter((s) => s.shape === 'circle').length
      const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)

      const answered = checkin({ reporter: 'patient', attention: { kind: 'answered', prompt_id: prompt.prompt_id, count: circles + 1 } }, home.questionnaire_version)
      await postReport(answered)
      const task = (await getVisitDetail(visit.visit_id)).open_task!
      expect(task.reasons.map((r) => r.reason_code)).toContain('attention_incorrect')
      expect(task.level).toBe('overdue') // non-urgent

      // The prompt cannot be used twice.
      await expect(
        postReport(checkin({ reporter: 'patient', attention: { kind: 'answered', prompt_id: prompt.prompt_id, count: circles }, pain: { kind: 'answered', value: 1 } }, home.questionnaire_version)),
      ).rejects.toMatchObject({ status: 409 })
    })

    it('a correct count opens no task', async () => {
      await exchangeToken({ token: 'demo-general-token', role: 'patient' })
      const home = await getPatientHome()
      const prompt = home.attention_prompt!
      const circles = prompt.steps.filter((s) => s.shape === 'circle').length
      await postReport(checkin({ reporter: 'patient', attention: { kind: 'answered', prompt_id: prompt.prompt_id, count: circles } }, home.questionnaire_version))
      const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)
      expect((await getVisitDetail(visit.visit_id)).open_task).toBeNull()
    })

    it('a companion cannot send a prompt id or pain', async () => {
      await exchangeToken({ token: 'demo-general-token', role: 'patient' })
      const prompt = (await getPatientHome()).attention_prompt!
      await exchangeToken({ token: 'demo-general-token', role: 'companion' })
      const v = (await getPatientHome()).questionnaire_version
      await expect(postReport(checkin({ reporter: 'companion', pain: { kind: 'answered', value: 5 } }, v))).rejects.toMatchObject({ status: 422 })
      await expect(
        postReport(checkin({ reporter: 'companion', attention: { kind: 'missing', reason: 'not_asked', prompt_id: prompt.prompt_id } }, v)),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('a patient response never moves the staff timer', async () => {
      await exchangeToken({ token: 'demo-general-token', role: 'companion' })
      const v = (await getPatientHome()).questionnaire_version
      const before = (await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)).staff_reassess_due_at
      await postReport(checkin({ reporter: 'companion' }, v))
      expect((await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)).staff_reassess_due_at).toBe(before)
    })
  })

  describe('app exclusion', () => {
    it('an excluded enrolment has no links, no channel and no prompt timer', async () => {
      const e = await enrolVisit({ submission_id: newSubmissionId(), ctas: 4, complaint_group: 'general', cedis_code: '609', app_exclusion: 'child', language: 'en' })
      expect(e).toMatchObject({ app_exclusion: 'child', link: null })
      await expect(getVisitLink(e.visit_id)).rejects.toMatchObject({ status: 409 })
      const v = (await getVisitDetail(e.visit_id)).visit
      expect(v).toMatchObject({ app_exclusion: 'child', channel: null, next_prompt_due_at: null })
      expect(v.staff_reassess_due_at).not.toBeNull()
    })

    it('rejects a channel for an excluded visit, a missing channel otherwise, and CEDIS conflicts', async () => {
      const base = { submission_id: newSubmissionId(), ctas: 3 as const, language: 'en' as const }
      await expect(enrolVisit({ ...base, complaint_group: 'general', app_exclusion: 'child', channel: 'phone' })).rejects.toMatchObject({ status: 422 })
      await expect(enrolVisit({ ...base, complaint_group: 'general' })).rejects.toMatchObject({ status: 422 })
      await expect(enrolVisit({ ...base, complaint_group: 'general', cedis_code: '402', channel: 'phone' })).rejects.toMatchObject({ status: 422 })
      await expect(enrolVisit({ ...base, complaint_group: 'general', cedis_code: '351', channel: 'phone' })).rejects.toMatchObject({ status: 422 })
    })

    it('stopping the app after enrolment signs the patient out, cannot be undone, and keeps the staff timer', async () => {
      await exchangeToken({ token: 'demo-general-token', role: 'patient' })
      await getPatientHome()
      const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)

      await updateVisitExclusion(visit.visit_id, { submission_id: newSubmissionId(), app_exclusion: 'major_trauma' })
      const after = (await getVisitDetail(visit.visit_id)).visit
      expect(after).toMatchObject({ app_exclusion: 'major_trauma', next_prompt_due_at: null })
      expect(after.staff_reassess_due_at).toBe(visit.staff_reassess_due_at)
      await expect(getPatientHome()).rejects.toMatchObject({ status: 401 })
      await expect(updateVisitExclusion(visit.visit_id, { submission_id: newSubmissionId(), app_exclusion: 'child' })).rejects.toMatchObject({ status: 409 })
    })
  })
})

describe('physician review flow', () => {
  it('shows ranked active concerns and filters acknowledged tasks', async () => {
    sessionStorage.setItem('recheck-demo-role', 'physician')
    const user = userEvent.setup()
    renderApp('/staff/physician')
    expect(await screen.findByRole('heading', { name: 'Physician worklist' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Review tasks' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('New chest pain reported')
    await user.click(screen.getByRole('button', { name: /To assess/ }))
    expect(await screen.findByText('No acknowledged tasks')).toBeInTheDocument()
  })

  it('offers "Clear search" when a search finds nothing', async () => {
    sessionStorage.setItem('recheck-demo-role', 'physician')
    const user = userEvent.setup()
    renderApp('/staff/physician')
    await screen.findByRole('list', { name: 'Review tasks' })
    await user.type(screen.getByRole('searchbox', { name: 'Find a visit or concern' }), 'zzz')
    expect(await screen.findByText('No matching visits')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(within(await screen.findByRole('list', { name: 'Review tasks' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('searchbox', { name: 'Find a visit or concern' })).toHaveFocus()
  })

  it('requires acknowledgement and an explicit disposition before completing an assessment', async () => {
    sessionStorage.setItem('recheck-demo-role', 'physician')
    const user = userEvent.setup()
    const visit = await visitWhere((r) => r.open_task?.level === 'red')
    renderApp(`/staff/visits/${visit.visit_id}/assessment`)
    const save = await screen.findByRole('button', { name: 'Record assessment' })
    await user.click(screen.getByRole('radio', { name: 'Tests ordered' }))
    await user.click(save) // not acknowledged yet
    expect(await screen.findByText('Acknowledge the task before you assess it.')).toBeInTheDocument()
    expect((await getVisitDetail(visit.visit_id)).open_task?.status).toBe('open')
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }))
    expect(await screen.findAllByText(/^Acknowledged \d/)).toHaveLength(2) // banner and card
    expect(screen.getByRole('radio', { name: 'Assessed, stable' })).toHaveFocus()
    await user.click(save)
    expect(await screen.findByRole('heading', { name: /^Tests ordered · .+ · Physician$/ })).toBeInTheDocument()
    expect((await getVisitDetail(visit.visit_id)).open_task).toBeNull()

  })

  it('keeps visit management to nurses and sends a physician back to the overview', async () => {
    sessionStorage.setItem('recheck-demo-role', 'physician')
    const visit = await visitWhere((r) => r.open_task?.level === 'red')
    renderApp(`/staff/visits/${visit.visit_id}/manage`)
    const tabs = await screen.findByRole('navigation', { name: 'Visit pages' })
    expect(within(tabs).queryByRole('link', { name: 'Visit management' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
  })

  it('redirects a physician from nurse enrolment', async () => {
    sessionStorage.setItem('recheck-demo-role', 'physician')
    renderApp('/staff/visits/new')
    expect(await screen.findByRole('heading', { name: 'Physician worklist' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New visit' })).not.toBeInTheDocument()
  })

  it('keeps desk-only questions off physician review and shows a subsequent urgent concern', async () => {
    sessionStorage.setItem('recheck-demo-role', 'physician')
    await exchangeToken({ token: 'demo-general-token', role: 'patient' })
    await postReport({ kind: 'concern', concern: 'desk_question', ...common() })
    const visit = await visitWhere((row) => row.open_task?.routed_to.length === 1 && row.open_task.routed_to[0] === 'triage_nurse')
    renderApp('/staff/physician')
    const list = await screen.findByRole('list', { name: 'Review tasks' })
    expect(list.querySelector(`a[href="/staff/visits/${visit.visit_id}"]`)).toBeNull()
    await postReport({ kind: 'concern', concern: 'help_now', ...common() })
    expect((await getVisitDetail(visit.visit_id)).open_task?.routed_to).toContain('physician')
  })

  it('attributes mock physician actions to the chosen demo role', async () => {
    sessionStorage.setItem('recheck-demo-role', 'physician')
    const visit = await visitWhere((r) => r.open_task?.level === 'red')
    const task = (await getVisitDetail(visit.visit_id)).open_task!
    const acknowledged = await acknowledgeTask(task.task_id, { submission_id: newSubmissionId() })
    expect(acknowledged.acknowledged_by?.role).toBe('physician')
    const assessed = await assessTask(task.task_id, { submission_id: newSubmissionId(), disposition: 'tests_ordered' })
    expect(assessed.assessed_by?.role).toBe('physician')
  })
})
