import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { resetMockState } from '@/api/mocks/store'
import { server } from '@/api/mocks/server'

// Node's fetch needs absolute URLs; the app uses relative API paths.
const realFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(typeof input === 'string' && input.startsWith('/') ? `http://localhost:3000${input}` : input, init)) as typeof fetch

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(() => {
  resetMockState()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
