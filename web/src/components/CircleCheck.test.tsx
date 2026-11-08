import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttentionPrompt } from '@/api/types'
import '@/i18n'
import { CircleCheck } from './CircleCheck'

const prompt = (over: Partial<AttentionPrompt> = {}): AttentionPrompt => ({
  prompt_id: '22222222-2222-4222-8222-222222222222',
  steps: [
    { shape: 'circle', x: 0.2, y: 0.3 },
    { shape: 'square', x: 0.7, y: 0.6 },
    { shape: 'circle', x: 0.5, y: 0.2 },
  ],
  show_ms: 1000,
  gap_ms: 500,
  expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  ...over,
})

const setup = (p = prompt()) => {
  const onDone = vi.fn()
  const onExpired = vi.fn()
  render(<CircleCheck prompt={p} role="patient" onDone={onDone} onExpired={onExpired} />)
  return { onDone, onExpired, prompt: p }
}
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))

describe('CircleCheck', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows each shape for show_ms with a gap_ms blank between, once, in the order the server issued', () => {
    setup()
    expect(screen.getByRole('heading', { name: /Count the circles/ })).toBeInTheDocument()
    expect(screen.queryByTestId('play-area')).not.toBeInTheDocument()

    click('Start')
    expect(screen.queryByTestId(/shape-/)).not.toBeInTheDocument() // 600ms lead-in
    tick(600)
    expect(screen.getByTestId('shape-circle')).toBeInTheDocument()
    tick(1000) // show_ms elapsed: blank gap
    expect(screen.queryByTestId(/shape-/)).not.toBeInTheDocument()
    tick(500)
    expect(screen.getByTestId('shape-square')).toBeInTheDocument() // second step is a square
    tick(1500)
    expect(screen.getByTestId('shape-circle')).toBeInTheDocument() // third
    tick(1500)
    expect(screen.queryByTestId('play-area')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Number of circles' })).toBeInTheDocument()
  })

  it('circles and squares differ by shape, not only by colour', () => {
    setup()
    click('Start')
    tick(600)
    expect(screen.getByTestId('shape-circle').className).toContain('rounded-full')
    tick(2000)
    expect(screen.getByTestId('shape-square').className).toContain('rounded-none')
  })

  it('places each shape where the server said (fractions of the play area)', () => {
    setup()
    click('Start')
    tick(600)
    expect(screen.getByTestId('shape-circle')).toHaveStyle({ left: '20%', top: '30%' })
  })

  it('has no replay once the shapes have played', () => {
    setup()
    click('Start')
    tick(600 + 3 * 1500)
    expect(screen.queryByRole('button', { name: /start|again|replay/i })).not.toBeInTheDocument()
  })

  it('starts with no count, so Done cannot send 0 by mistake', () => {
    const { onDone } = setup()
    click('Start')
    tick(600 + 3 * 1500)
    expect(screen.getByRole('heading', { name: /How many circles did you see\?/ })).toBeInTheDocument()
    expect(screen.getByText('\u2013')).toBeInTheDocument()
    click('Done')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Tap \u2212 or + to choose a number.')
  })

  it('reports the count entered', () => {
    const { onDone } = setup()
    click('Start')
    tick(600 + 3 * 1500)
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    expect(screen.getByText('2')).toBeInTheDocument()
    click('Done')
    expect(onDone).toHaveBeenCalledWith({ shown: true, count: 2 })
  })

  it('reports zero once the patient chooses it', () => {
    const { onDone } = setup()
    click('Start')
    tick(600 + 3 * 1500)
    fireEvent.click(screen.getByRole('button', { name: 'One fewer' }))
    click('Done')
    expect(onDone).toHaveBeenCalledWith({ shown: true, count: 0 })
  })

  it('cannot count below zero or above twenty', () => {
    setup()
    click('Start')
    tick(600 + 3 * 1500)
    fireEvent.click(screen.getByRole('button', { name: 'One fewer' }))
    expect(screen.getByRole('button', { name: 'One fewer' })).toBeDisabled()
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByRole('button', { name: 'One more' }))
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'One more' })).toBeDisabled()
  })

  it('tells the page while the shapes play, so it can hide everything but "I need help now"', () => {
    const onPlayingChange = vi.fn()
    render(<CircleCheck prompt={prompt()} role="patient" onDone={vi.fn()} onExpired={vi.fn()} onPlayingChange={onPlayingChange} />)
    expect(onPlayingChange).toHaveBeenLastCalledWith(false)
    click('Start')
    expect(onPlayingChange).toHaveBeenLastCalledWith(true)
    tick(600 + 3 * 1500)
    expect(onPlayingChange).toHaveBeenLastCalledWith(false)
  })

  it('"I\'m not sure" is shown-not-answered with reason unsure', () => {
    const { onDone } = setup()
    click('Start')
    tick(600 + 3 * 1500)
    click("I'm not sure")
    expect(onDone).toHaveBeenCalledWith({ shown: true, skip: 'unsure' })
  })

  it('"I can\'t do this" before starting still counts as shown, so staff are told', () => {
    const { onDone } = setup()
    click("I can't do this")
    expect(onDone).toHaveBeenCalledWith({ shown: true, skip: 'unable_to_respond' })
  })

  it('"I can\'t do this" while the shapes play stops the timers and counts as shown', () => {
    const { onDone } = setup()
    click('Start')
    tick(700)
    click("I can't do this")
    expect(onDone).toHaveBeenCalledWith({ shown: true, skip: 'unable_to_respond' })
  })

  it('an expired prompt asks for a new one instead of playing', () => {
    const { onExpired, onDone } = setup(prompt({ expires_at: new Date(Date.now() - 1000).toISOString() }))
    click('Start')
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('play-area')).not.toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('tells assistive technology what to do and offers a way out for people who cannot see the screen', () => {
    setup()
    expect(screen.getByRole('button', { name: "I can't do this" })).toBeInTheDocument()
    click('Start')
    expect(screen.getByRole('status')).toHaveTextContent('Watch the screen and count the circles.')
  })
})
