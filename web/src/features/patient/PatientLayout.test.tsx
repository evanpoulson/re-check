import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PatientHome } from '@/api/types'
import '@/i18n'
import { PatientLayout } from './PatientLayout'

const home = (over: Partial<PatientHome>): PatientHome => ({
  role: 'patient',
  language: 'en',
  wait_estimate: null,
  waited_minutes: 130,
  next_checkin_due_at: null,
  questionnaire_version: 'v',
  items: [],
  message: 'none',
  ...over,
})

describe('department wait', () => {
  it('words the estimate as AHS defines it, rounded, with when it was updated, plus time waited', () => {
    render(<PatientLayout home={home({ wait_estimate: { minutes: 295, source: 'ahs_feed', as_of: new Date().toISOString() } })}>x</PatientLayout>)
    expect(screen.getByText(/^AHS estimate right now: about 4 to 5 hours from triage to seeing a doctor, for less urgent patients\. It is not your personal wait\. Updated /)).toBeInTheDocument()
    expect(screen.getByText('You have waited 2 hours 10 minutes since triage.')).toBeInTheDocument()
  })

  it('rounds a short estimate to the nearest ten minutes', () => {
    render(<PatientLayout home={home({ wait_estimate: { minutes: 44, source: 'ahs_feed', as_of: new Date().toISOString() } })}>x</PatientLayout>)
    expect(screen.getByText(/^AHS estimate right now: about 40 minutes from triage/)).toBeInTheDocument()
  })

  it('says the AHS estimate is not available when there is no fresh estimate, and still shows time waited', () => {
    render(<PatientLayout home={home({ wait_estimate: null, waited_minutes: 5 })}>x</PatientLayout>)
    expect(screen.getByText('AHS wait estimate not available right now.')).toBeInTheDocument()
    expect(screen.getByText('You have waited 5 minutes since triage.')).toBeInTheDocument()
  })
})
