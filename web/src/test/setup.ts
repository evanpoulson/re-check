import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { resetMockState } from '@/api/mocks/store'
import { server } from '@/api/mocks/server'
import i18n from '@/i18n'

// Node's fetch needs absolute URLs; the app uses relative API paths.
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(typeof input === 'string' && input.startsWith('/') ? `http://localhost:3000${input}` : input, init)) as typeof fetch

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  resetMockState()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(async () => {
  cleanup()
  // A test that switches the patient's language must not leak it into the next.
  await i18n.changeLanguage('en')
  server.resetHandlers()
})
afterAll(() => server.close())
