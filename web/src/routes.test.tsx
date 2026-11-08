import { render, screen } from '@testing-library/react'
import { RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import './i18n'
import { createTestRouter } from './routes'

describe('routes', () => {
  it.each([
    ['/staff/sign-in', 'Choose a demo role'],
    ['/staff/visits/new', 'New visit'],
    ['/staff/triage', 'Triage board'],
    ['/staff/visits/abc', 'Visit'],
    ['/v/some-token', 'Opening your check-in'],
    ['/check-in', 'Check-in'],
    ['/nope', 'Page not found'],
  ])('%s renders its screen', (path, heading) => {
    render(<RouterProvider router={createTestRouter([path])} />)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('sends / to the staff sign-in', () => {
    render(<RouterProvider router={createTestRouter(['/'])} />)
    expect(screen.getByRole('heading', { name: 'Choose a demo role' })).toBeInTheDocument()
  })
})
