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
  it('words the estimate as AHS defines it, rounded, with when it was updated, plus time waited', () => {
    render(<PatientLayout about home={home({ wait_estimate: { minutes: 295, source: 'ahs_feed', as_of: new Date().toISOString() } })}>x</PatientLayout>)
    expect(screen.getByText('AHS estimate')).toBeInTheDocument()
    expect(screen.getByText(/^about 4 to 5 hours from triage to seeing a doctor, for less urgent patients/)).toBeInTheDocument()
    expect(screen.getByText(/^Not your personal wait\. Updated /)).toBeInTheDocument()
    expect(screen.getByText("You've waited since triage")).toBeInTheDocument()
    expect(screen.getByText('2 hours 10 minutes')).toBeInTheDocument()
  })

  it('rounds a short estimate to the nearest ten minutes', () => {
    render(<PatientLayout about home={home({ wait_estimate: { minutes: 44, source: 'ahs_feed', as_of: new Date().toISOString() } })}>x</PatientLayout>)
    expect(screen.getByText(/^about 40 minutes from triage/)).toBeInTheDocument()
  })

  it('says the AHS estimate is not available when there is no fresh estimate, and still shows time waited', () => {
    render(<PatientLayout about home={home({ wait_estimate: null, waited_minutes: 5 })}>x</PatientLayout>)
    expect(screen.getByText('Not available right now.')).toBeInTheDocument()
    expect(screen.getByText('5 minutes')).toBeInTheDocument()
  })
})

describe('question and form screens', () => {
  it('show only the place-in-line promise, not the wait, triage card or "What we store"', () => {
    render(<PatientLayout home={home({ triage_level: 3 })}>x</PatientLayout>)
    expect(screen.getByText(/Staff decide the order of care/)).toBeInTheDocument()
    expect(screen.queryByText('AHS estimate')).not.toBeInTheDocument()
    expect(screen.queryByText('How triage works')).not.toBeInTheDocument()
    expect(screen.queryByText('What we store')).not.toBeInTheDocument()
  })
})

describe('triage card', () => {
  it('always explains how triage works, and hides the level unless the site shows it', () => {
    render(<PatientLayout about home={home({ triage_level: null })}>x</PatientLayout>)
    expect(screen.getByText('How triage works')).toBeInTheDocument()
    expect(screen.getByText(/sees the sickest people first/)).toBeInTheDocument()
    expect(screen.queryByText('Your triage level')).not.toBeInTheDocument()
  })

  it('shows the level in plain words when the server sends it', () => {
    render(<PatientLayout about home={home({ triage_level: 3 })}>x</PatientLayout>)
    expect(screen.getByRole('heading', { name: 'Your triage level' })).toBeInTheDocument()
    expect(screen.getByText('Level 3: Urgent')).toBeInTheDocument()
    expect(screen.getByText(/People who are sicker may be seen first/)).toBeInTheDocument()
  })

  it('words the heading for a companion', () => {
    render(<PatientLayout about home={home({ role: 'companion', triage_level: 5 })}>x</PatientLayout>)
    expect(screen.getByRole('heading', { name: "The patient's triage level" })).toBeInTheDocument()
    expect(screen.getByText('Level 5: Not urgent')).toBeInTheDocument()
  })

  it('shows the card in the chosen language, right to left for Arabic', async () => {
    await i18n.changeLanguage('ar')
    try {
      render(<PatientLayout about home={home({ triage_level: 4 })}>x</PatientLayout>)
      expect(screen.getByText('المستوى 4: أقل إلحاحًا')).toBeInTheDocument()
      expect(screen.getByText('كيف يعمل الفرز (الترياج)')).toBeInTheDocument()
      expect(document.documentElement.dir).toBe('rtl')
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
