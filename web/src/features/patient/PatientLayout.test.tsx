import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PatientHome } from '@/api/types'
import i18n from '@/i18n'
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

describe('triage card', () => {
  it('always explains how triage works, and hides the level unless the site shows it', () => {
    render(<PatientLayout home={home({ triage_level: null })}>x</PatientLayout>)
    expect(screen.getByText('How triage works')).toBeInTheDocument()
    expect(screen.getByText(/sees the sickest people first/)).toBeInTheDocument()
    expect(screen.queryByText('Your triage level')).not.toBeInTheDocument()
  })

  it('shows the level in plain words when the server sends it', () => {
    render(<PatientLayout home={home({ triage_level: 3 })}>x</PatientLayout>)
    expect(screen.getByRole('heading', { name: 'Your triage level' })).toBeInTheDocument()
    expect(screen.getByText('Level 3: Urgent')).toBeInTheDocument()
    expect(screen.getByText(/People who are sicker may be seen first/)).toBeInTheDocument()
  })

  it('words the heading for a companion', () => {
    render(<PatientLayout home={home({ role: 'companion', triage_level: 5 })}>x</PatientLayout>)
    expect(screen.getByRole('heading', { name: "The patient's triage level" })).toBeInTheDocument()
    expect(screen.getByText('Level 5: Not urgent')).toBeInTheDocument()
  })

  it('shows the card in the chosen language, right to left for Arabic', async () => {
    await i18n.changeLanguage('ar')
    try {
      render(<PatientLayout home={home({ triage_level: 4 })}>x</PatientLayout>)
      expect(screen.getByText('المستوى 4: أقل إلحاحًا')).toBeInTheDocument()
      expect(screen.getByText('كيف يعمل الفرز (الترياج)')).toBeInTheDocument()
      expect(document.documentElement.dir).toBe('rtl')
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
