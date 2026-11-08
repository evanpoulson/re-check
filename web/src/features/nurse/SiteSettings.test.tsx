import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { siteSettings } from '@/api/mocks/store'
import { SiteSettingsCard } from './SiteSettings'

describe('site settings', () => {
  it('starts off and saves the switch for the whole site', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SiteSettingsCard />
      </QueryClientProvider>,
    )
    const toggle = await screen.findByRole('switch', { name: 'Show patients their triage level' })
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    await waitFor(() => expect(siteSettings().show_triage_level).toBe(true))
    await waitFor(() => expect(toggle).toBeChecked())
  })
})
