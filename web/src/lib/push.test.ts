import { describe, expect, it } from 'vitest'
import { keyBytes, reminderSupport } from './push'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'
const nav = (userAgent: string, extra: object = {}) => ({ userAgent, maxTouchPoints: 5, serviceWorker: {}, ...extra })
const pushWindow = (standalone = false) => ({
  PushManager: {},
  Notification: {},
  matchMedia: (q: string) => ({ matches: standalone && q.includes('standalone') }),
})

describe('which reminder setup a phone gets', () => {
  it('sends an iPhone in a Safari tab to Add to Home Screen, even if it has the Push API', () => {
    expect(reminderSupport(nav(IPHONE), pushWindow())).toBe('needs-home-screen')
    expect(reminderSupport(nav(IPHONE), { matchMedia: () => ({ matches: false }) })).toBe('needs-home-screen')
  })

  it('lets an iPhone Home Screen app subscribe', () => {
    expect(reminderSupport(nav(IPHONE), pushWindow(true))).toBe('supported')
    expect(reminderSupport(nav(IPHONE, { standalone: true }), pushWindow())).toBe('supported')
  })

  it('treats an iPad that says it is a Mac as iOS', () => {
    const ipad = nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', { platform: 'MacIntel' })
    expect(reminderSupport(ipad, pushWindow())).toBe('needs-home-screen')
  })

  it('lets Android subscribe in the browser, and hides reminders without the Push API', () => {
    expect(reminderSupport(nav(ANDROID), pushWindow())).toBe('supported')
    expect(reminderSupport(nav(ANDROID), { matchMedia: () => ({ matches: false }) })).toBe('unsupported')
    const { serviceWorker: _, ...noWorker } = nav(ANDROID)
    expect(reminderSupport(noWorker, pushWindow())).toBe('unsupported')
  })
})

describe('server key', () => {
  it('decodes base64url without padding into the 65-byte key', () => {
    const bytes = keyBytes('BAEC_-' + 'A'.repeat(81))
    expect(bytes.length).toBe(65)
    expect(Array.from(bytes.slice(0, 4))).toEqual([4, 1, 2, 255])
  })
})
