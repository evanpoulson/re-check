import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/api/mocks/server'
import '@/i18n'
import { keyBytes } from '@/lib/push'
import { Reminders } from './Reminders'

// A real P-256 point's shape is all the client checks; the server validates it.
const KEY = 'B' + 'A'.repeat(86)
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc'

function fakeBrowser({ permission = 'default' as NotificationPermission, granted = true, subscribed = false } = {}) {
  const sub = {
    endpoint: ENDPOINT,
    options: { applicationServerKey: keyBytes(KEY).buffer },
    toJSON: () => ({ endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }),
    unsubscribe: vi.fn(async () => true),
  }
  let current: typeof sub | null = subscribed ? sub : null
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async (_options: PushSubscriptionOptionsInit) => (current = sub)),
  }
  const reg = { pushManager }
  const Notification = { permission, requestPermission: vi.fn(async () => (granted ? 'granted' : 'denied')) }
  vi.stubGlobal('Notification', Notification)
  vi.stubGlobal('PushManager', function PushManager() {})
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn(async () => reg), ready: Promise.resolve(reg), getRegistration: vi.fn(async () => reg) },
  })
  return { sub, pushManager, Notification, register: (navigator.serviceWorker as unknown as { register: ReturnType<typeof vi.fn> }).register }
}

function serverRemindersOn() {
  const saved: unknown[] = []
  let ended = 0
  server.use(
    http.get('*/api/patient/push', () => HttpResponse.json({ enabled: true, public_key: KEY })),
    http.put('*/api/patient/push/subscription', async ({ request }) => {
      saved.push(await request.json())
      return new HttpResponse(null, { status: 204 })
    }),
    http.delete('*/api/patient/push/subscription', () => {
      ended += 1
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return { saved, ended: () => ended }
}

function show(support?: 'supported' | 'needs-home-screen' | 'unsupported') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Reminders support={support} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
  // jsdom has no service worker container; remove the fake.
  delete (navigator as unknown as Record<string, unknown>).serviceWorker
})

describe('check-in reminders', () => {
  it('shows nothing when the server sends no reminders', async () => {
    server.use(http.get('*/api/patient/push', () => HttpResponse.json({ enabled: false, public_key: null })))
    fakeBrowser()
    show('supported')
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('button', { name: 'Turn on reminders' })).not.toBeInTheDocument()
  })

  it('asks permission on a tap, subscribes with the server key and saves only endpoint and keys', async () => {
    const api = serverRemindersOn()
    const browser = fakeBrowser()
    show('supported')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Turn on reminders' }))

    expect(browser.Notification.requestPermission).toHaveBeenCalledOnce()
    expect(browser.register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
    const options = browser.pushManager.subscribe.mock.calls[0]![0]
    expect(options.userVisibleOnly).toBe(true)
    expect(Array.from(options.applicationServerKey as Uint8Array)).toEqual(Array.from(keyBytes(KEY)))
    await screen.findByText(/Reminders are on/)
    expect(api.saved).toEqual([{ endpoint: ENDPOINT, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }])
    expect(screen.getByText(/staff still check on you/)).toBeInTheDocument()
  })

  it('says how to unblock notifications when permission is refused', async () => {
    serverRemindersOn()
    fakeBrowser({ granted: false })
    show('supported')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Turn on reminders' }))
    await screen.findByText(/Notifications are blocked/)
    expect(screen.queryByRole('button', { name: 'Turn on reminders' })).not.toBeInTheDocument()
  })

  it('re-saves an existing subscription for this sign-in, and turns it off on request', async () => {
    const api = serverRemindersOn()
    const browser = fakeBrowser({ permission: 'granted', subscribed: true })
    show('supported')
    await screen.findByText(/Reminders are on/)
    expect(api.saved).toHaveLength(1)
    expect(browser.Notification.requestPermission).not.toHaveBeenCalled()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Turn off reminders' }))
    await screen.findByRole('button', { name: 'Turn on reminders' })
    expect(api.ended()).toBe(1)
    expect(browser.sub.unsubscribe).toHaveBeenCalledOnce()
  })

  it('explains Add to Home Screen in Safari on an iPhone', async () => {
    serverRemindersOn()
    show('needs-home-screen')
    await screen.findByRole('heading', { name: 'Get check-in reminders on iPhone' })
    expect(screen.getByText('Choose "Add to Home Screen".')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing in a browser without Web Push', async () => {
    serverRemindersOn()
    show('unsupported')
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument())
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/reminders/i)).not.toBeInTheDocument()
  })
})
