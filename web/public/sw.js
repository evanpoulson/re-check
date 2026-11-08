// Recheck service worker: shows check-in reminders sent by Web Push.
//
// It has no fetch handler and caches no pages; the app works the same without
// it. The server's message is generic English. The page stores the same
// reminder in the person's language (src/lib/push.ts), and that is shown
// instead when present. Tapping the reminder opens the check-in.

const TEXT_CACHE = 'recheck-reminder-text'
const TEXT_URL = '/__recheck/reminder-text'
const CHECK_IN = '/check-in'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

async function reminderText(fallback) {
  try {
    const cache = await caches.open(TEXT_CACHE)
    const stored = await cache.match(TEXT_URL)
    if (stored) {
      const text = await stored.json()
      if (typeof text.title === 'string' && typeof text.body === 'string') return text
    }
  } catch {
    // Fall back to the server's English text.
  }
  return fallback
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Not JSON: still remind, with the default text.
  }
  const fallback = {
    title: typeof data.title === 'string' ? data.title : 'Recheck',
    body: typeof data.body === 'string' ? data.body : "It's time for your check-in.",
  }
  event.waitUntil(
    reminderText(fallback).then((text) =>
      self.registration.showNotification(text.title, {
        body: text.body,
        // Each reminder replaces the last, and still buzzes.
        tag: 'recheck-checkin',
        renotify: true,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data: { url: CHECK_IN },
      }),
    ),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).pathname === CHECK_IN)
      return open ? open.focus() : self.clients.openWindow(CHECK_IN)
    }),
  )
})
