import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import {
  acknowledgeTask,
  assessTask,
  enrolVisit,
  exchangeToken,
  getPatientHome,
  getTriageBoard,
  getVisitDetail,
  getWorklist,
  postReport,
  updateVisitExclusion,
} from './api/api'
import { ApiError, newSubmissionId } from './api/client'
import type { CheckinReport, PatientReport } from './api/types'
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
  it('/ goes to the demo role picker', async () => {
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
    expect(screen.getByRole('img', { name: 'QR code for Patient' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR code for Companion' })).toBeInTheDocument()
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

  it('a CEDIS code from the backend map locks the complaint group', async () => {
    signInAsNurse()
    const user = userEvent.setup()
    renderApp('/staff/visits/new')
    await user.type(await screen.findByLabelText(/CEDIS code/), '402')
    expect(screen.getByLabelText('Presenting complaint')).toHaveValue('confused_drowsy')
    expect(screen.getByLabelText('Presenting complaint')).toBeDisabled()
    expect(screen.getByText('Set by the CEDIS code.')).toBeInTheDocument()
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
    expect(child).toHaveTextContent('App not offered: Child')
    expect(child).toHaveTextContent('Not applicable')
    expect(child).not.toHaveTextContent('No response')
  })

  it('a new flag shows a badge but never moves a row or its numeral', async () => {
    signInAsNurse()
    const before = await queue()
    await exchangeToken({ token: 'demo-patient-general-token' })
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
  it('opens from the QR link and shows the place-in-line promise and wait range', async () => {
    renderApp('/v/demo-patient-chest-token')
    expect(await screen.findByRole('heading', { name: 'You are checked in' })).toBeInTheDocument()
    expect(screen.getByText(/Your answers never change your place in line\./)).toBeInTheDocument()
    expect(screen.getByText(/Estimated wait: 30 to 90 minutes/)).toBeInTheDocument()
    expect(screen.getByText('What we store')).toBeInTheDocument()
  })

  it('shows all four always-visible buttons from the question bank', async () => {
    renderApp('/v/demo-patient-chest-token')
    await screen.findByRole('heading', { name: 'You are checked in' })
    for (const name of ['I need help now', "I'm worried I'm getting worse", 'Question about my wait or care', "I'm leaving"]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('uses the bank\'s companion wording on the buttons for a companion', async () => {
    renderApp('/v/demo-companion-general-token')
    await screen.findByRole('heading', { name: 'You are helping with a check-in' })
    expect(screen.getByRole('button', { name: 'They need help now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'The patient is leaving' })).toBeInTheDocument()
  })

  it('a bad code says so and never shows a visit', async () => {
    renderApp('/v/not-a-real-code-at-all-1234')
    expect(await screen.findByText('This code did not work')).toBeInTheDocument()
  })

  it('the question to the desk goes to the triage nurse and never shows the urgent screen', async () => {
    const user = userEvent.setup()
    renderApp('/v/demo-patient-general-token')
    await user.click(await screen.findByRole('button', { name: 'Question about my wait or care' }))
    expect(await screen.findByRole('heading', { name: 'Your question went to the triage nurse' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tell a staff member now' })).not.toBeInTheDocument()
  })

  it('"I need help now" shows the tell-a-staff-member screen and never any task level', async () => {
    const user = userEvent.setup()
    renderApp('/v/demo-patient-general-token')
    await user.click(await screen.findByRole('button', { name: 'I need help now' }))
    expect(await screen.findByRole('heading', { name: 'Tell a staff member now' })).toBeInTheDocument()
    expect(screen.queryByText(/^Red$/)).not.toBeInTheDocument()
  })

  it('asks "Who is answering?" first, preselected from the QR, in the bank wording', async () => {
    const user = userEvent.setup()
    renderApp('/v/demo-companion-general-token')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    expect(await screen.findByRole('heading', { name: 'Who is answering?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Someone with the patient' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: "I'm not sure" })).not.toBeInTheDocument() // no "Not sure" on this question
  })

  it('a companion is never asked for pain or the circle check', async () => {
    const user = userEvent.setup()
    renderApp('/v/demo-companion-general-token')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('heading', { name: 'How do they seem right now?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Good' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'About the same' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    // The next question is the warning signs, not pain.
    expect(await screen.findByRole('heading', { name: /Since they arrived, have you noticed any of this/ })).toBeInTheDocument()
    expect(screen.queryByText(/How bad is your pain/)).not.toBeInTheDocument()
    // It is the last step for the general group, so there is no circle check either.
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('a patient is asked for pain, then the circle check, and "I can\'t do this" still names the prompt', async () => {
    const user = userEvent.setup()
    renderApp('/v/demo-patient-general-token')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(await screen.findByRole('button', { name: 'Next' })) // who is answering
    await user.click(await screen.findByRole('button', { name: 'Good' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'About the same' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/How bad is your pain right now/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'None of these' }))
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
    renderApp('/v/demo-companion-general-token')
    await user.click(await screen.findByRole('button', { name: 'Start check-in' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Good' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'About the same' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Speech is different or hard to understand' }))
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('heading', { name: 'Tell a staff member now' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "I'm telling staff" }))
    // The follow-up is asked only after the urgent screen, in the companion wording.
    expect(await screen.findByRole('heading', { name: 'When were they last speaking and moving as usual?' })).toBeInTheDocument()
  })

  it('shows an English-only notice for Punjabi and Tagalog until translations exist', async () => {
    const user = userEvent.setup()
    renderApp('/v/demo-patient-chest-token')
    await screen.findByRole('heading', { name: 'You are checked in' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'pa')
    expect(await screen.findByRole('note')).toHaveTextContent('Questions are shown in English for now')
  })
})

describe('the loop and the backend rules', () => {
  it('runs enrol, scan, report, flag, acknowledge, assess against the contract', async () => {
    const before = await queue()
    const enrolled = await enrolVisit({ submission_id: newSubmissionId(), ctas: 3, complaint_group: 'chest_back_pain', cedis_code: '003', language: 'en', channel: 'phone' })
    expect(enrolled.patient_link).toBeTruthy()
    await exchangeToken({ token: enrolled.patient_link!.split('/v/')[1]! })
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
    await exchangeToken({ token: 'demo-patient-general-token' })
    const home = await getPatientHome()
    const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)
    await postReport(checkin({ reporter: 'patient', feeling_change: { kind: 'answered', value: 'better' } }, home.questionnaire_version))
    expect((await getVisitDetail(visit.visit_id)).open_task).toBeNull()
    await postReport(checkin({ reporter: 'patient', feeling_change: { kind: 'answered', value: 'much_worse' } }, home.questionnaire_version))
    expect((await getVisitDetail(visit.visit_id)).open_task?.level).toBe('red')
  })

  describe('the circle check', () => {
    it('a patient gets a prompt and a companion never does', async () => {
      await exchangeToken({ token: 'demo-patient-general-token' })
      const p = (await getPatientHome()).attention_prompt!
      expect(p.steps.length).toBeGreaterThanOrEqual(6)
      expect(p.show_ms).toBeGreaterThanOrEqual(200)
      expect((await getPatientHome()).attention_prompt!.prompt_id).toBe(p.prompt_id) // stable across refetches

      await exchangeToken({ token: 'demo-companion-confused-token' })
      expect((await getPatientHome()).attention_prompt).toBeNull()
    })

    it('a wrong count opens a non-urgent check; a prompt is single use', async () => {
      await exchangeToken({ token: 'demo-patient-general-token' })
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
      await exchangeToken({ token: 'demo-patient-general-token' })
      const home = await getPatientHome()
      const prompt = home.attention_prompt!
      const circles = prompt.steps.filter((s) => s.shape === 'circle').length
      await postReport(checkin({ reporter: 'patient', attention: { kind: 'answered', prompt_id: prompt.prompt_id, count: circles } }, home.questionnaire_version))
      const visit = await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)
      expect((await getVisitDetail(visit.visit_id)).open_task).toBeNull()
    })

    it('a companion cannot send a prompt id or pain', async () => {
      await exchangeToken({ token: 'demo-patient-general-token' })
      const prompt = (await getPatientHome()).attention_prompt!
      await exchangeToken({ token: 'demo-companion-general-token' })
      const v = (await getPatientHome()).questionnaire_version
      await expect(postReport(checkin({ reporter: 'companion', pain: { kind: 'answered', value: 5 } }, v))).rejects.toMatchObject({ status: 422 })
      await expect(
        postReport(checkin({ reporter: 'companion', attention: { kind: 'missing', reason: 'not_asked', prompt_id: prompt.prompt_id } }, v)),
      ).rejects.toMatchObject({ status: 422 })
    })

    it('a patient response never moves the staff timer', async () => {
      await exchangeToken({ token: 'demo-companion-general-token' })
      const v = (await getPatientHome()).questionnaire_version
      const before = (await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)).staff_reassess_due_at
      await postReport(checkin({ reporter: 'companion' }, v))
      expect((await visitWhere((r) => r.visit.complaint_group === 'general' && r.visit.ctas === 3)).staff_reassess_due_at).toBe(before)
    })
  })

  describe('app exclusion', () => {
    it('an excluded enrolment has no links, no channel and no prompt timer', async () => {
      const e = await enrolVisit({ submission_id: newSubmissionId(), ctas: 4, complaint_group: 'general', cedis_code: '609', app_exclusion: 'child', language: 'en' })
      expect(e).toMatchObject({ app_exclusion: 'child', patient_link: null, companion_link: null, links_expire_at: null })
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
      await exchangeToken({ token: 'demo-patient-general-token' })
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
    localStorage.setItem('recheck-demo-role', 'physician')
    const user = userEvent.setup()
    renderApp('/staff/physician')
    expect(await screen.findByRole('heading', { name: 'Review worklist' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Review tasks' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('New chest pain reported')
    await user.click(screen.getByRole('button', { name: /Acknowledged/ }))
    expect(await screen.findByText('No acknowledged tasks')).toBeInTheDocument()
  })

  it('requires acknowledgement and an explicit disposition before completing an assessment', async () => {
    localStorage.setItem('recheck-demo-role', 'physician')
    const user = userEvent.setup()
    const visit = await visitWhere((r) => r.open_task?.level === 'red')
    renderApp(`/staff/visits/${visit.visit_id}`)
    await user.click(await screen.findByRole('button', { name: 'Acknowledge' }))
    const save = await screen.findByRole('button', { name: 'Record assessment' })
    expect(save).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Outcome of the assessment'), 'tests_ordered')
    await user.click(save)
    expect(await screen.findByRole('heading', { name: 'Assessment recorded' })).toBeInTheDocument()
    expect((await getVisitDetail(visit.visit_id)).open_task).toBeNull()
    await user.click(screen.getByText('Vitals & other staff actions'))
    await user.click(screen.getByRole('button', { name: 'Flag higher' }))
    await user.click(await screen.findByRole('button', { name: 'Acknowledge' }))
    expect(await screen.findByRole('button', { name: 'Record assessment' })).toBeDisabled()
    expect(screen.getByLabelText('Outcome of the assessment')).toHaveValue('')
  })

  it('attributes mock physician actions to the chosen demo role', async () => {
    localStorage.setItem('recheck-demo-role', 'physician')
    const visit = await visitWhere((r) => r.open_task?.level === 'red')
    const task = (await getVisitDetail(visit.visit_id)).open_task!
    const acknowledged = await acknowledgeTask(task.task_id, { submission_id: newSubmissionId() })
    expect(acknowledged.acknowledged_by?.role).toBe('physician')
    const assessed = await assessTask(task.task_id, { submission_id: newSubmissionId(), disposition: 'tests_ordered' })
    expect(assessed.assessed_by?.role).toBe('physician')
  })
})
