import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { CountdownChip } from './CountdownChip'

const now = Date.parse('2026-11-08T12:00:00Z')
const at = (sec: number) => new Date(now + sec * 1000).toISOString()

describe('CountdownChip (staff)', () => {
  it.each([[0], [30], [-30], [59], [-59]])('says "Due now" within a minute of the deadline (%ss)', (sec) => {
    render(<CountdownChip due={at(sec)} now={now} />)
    expect(screen.getByText('Due now')).toBeInTheDocument()
  })

  it('counts down, and marks overdue with the hourglass chip', () => {
    const { container, rerender } = render(<CountdownChip due={at(12 * 60)} now={now} />)
    expect(screen.getByText('in 12 min')).toBeInTheDocument()
    rerender(<CountdownChip due={at(-4 * 60)} now={now} />)
    expect(screen.getByText('4 min overdue')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('keeps the patient wording', () => {
    render(<CountdownChip due={at(-30)} now={now} patient />)
    expect(screen.getByText('Ready now')).toBeInTheDocument()
  })
})
