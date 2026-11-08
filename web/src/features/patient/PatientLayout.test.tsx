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
  it('shows the estimate as the department figure for new arrivals, plus time waited', () => {
    render(<PatientLayout home={home({ wait_estimate: { minutes: 295, source: 'ahs_feed', as_of: new Date().toISOString() } })}>x</PatientLayout>)
    expect(screen.getByText("The department's current estimate for new arrivals is about 4 h 55 min. You've been waiting 2 h 10 min.")).toBeInTheDocument()
  })

  it('says "Estimate unavailable" when there is no fresh estimate, and still shows time waited', () => {
    render(<PatientLayout home={home({ wait_estimate: null, waited_minutes: 5 })}>x</PatientLayout>)
    expect(screen.getByText("Estimate unavailable. You've been waiting 5 min.")).toBeInTheDocument()
  })
})
