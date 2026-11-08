import { endPushSubscription, savePushSubscription } from '@/api/api'

/**
 * Check-in reminders by Web Push. The service worker (public/sw.js) shows the
 * reminder; the server decides when to send one (api/src/recheck/push.py).
 *
 * iPhone and iPad only allow Web Push in a web app added to the Home Screen
 * (iOS 16.4+). In a Safari tab there is no PushManager, so the screen explains
 * how to add it instead.
 */

export type ReminderSupport = 'supported' | 'needs-home-screen' | 'unsupported'

const WORKER = '/sw.js'
// The service worker reads the reminder text in the person's language from here.
const TEXT_CACHE = 'recheck-reminder-text'
const TEXT_URL = '/__recheck/reminder-text'

type Nav = Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { platform?: string; standalone?: boolean; serviceWorker?: unknown }
type Win = { PushManager?: unknown; Notification?: unknown; matchMedia?: (q: string) => { matches: boolean } }

/** iPhone, iPad, or an iPad that reports itself as a Mac. */
export function isIos(nav: Nav): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

/** Opened from the Home Screen (or installed), not in a browser tab. */
export function isStandalone(nav: Nav, win: Win): boolean {
  return nav.standalone === true || win.matchMedia?.('(display-mode: standalone)').matches === true
}

export function reminderSupport(nav: Nav = navigator, win: Win = window as unknown as Win): ReminderSupport {
  if (isIos(nav) && !isStandalone(nav, win)) return 'needs-home-screen'
  return 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win ? 'supported' : 'unsupported'
}

/** The VAPID public key (base64url) as the bytes PushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options?.applicationServerKey
  if (!current) return false
  const a = new Uint8Array(current)
  return a.length === key.length && a.every((b, i) => b === key[i])
}

/** Only endpoint and keys: the browser's toJSON() also has expirationTime, which the API refuses. */
function body(sub: PushSubscription) {
  const json = sub.toJSON()
  return { endpoint: json.endpoint ?? sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } }
}

async function existing(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

/**
 * Ask for permission and subscribe. Call straight from a tap: iOS only shows the
 * permission prompt for a user gesture, so nothing is awaited before asking.
 */
export async function turnOnReminders(publicKey: string): Promise<'on' | 'blocked'> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'blocked'
  const reg = await navigator.serviceWorker.register(WORKER, { scope: '/' })
  await navigator.serviceWorker.ready
  const key = keyBytes(publicKey)
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub, key)) {
    // Subscribed with an older server key: a new subscription is needed.
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await savePushSubscription(body(sub))
  return 'on'
}

/** Tell the server first, so reminders stop even if the browser can't unsubscribe. */
export async function turnOffReminders(): Promise<void> {
  await endPushSubscription()
  await (await existing())?.unsubscribe()
}

/**
 * Where this device stands when the screen opens. A device that already has a
 * subscription saves it again, so it follows this sign-in (after a takeover or a
 * new scan, the server only knows the earlier session's).
 */
export async function currentReminders(publicKey: string): Promise<'on' | 'off' | 'blocked'> {
  if (Notification.permission === 'denied') return 'blocked'
  if (Notification.permission !== 'granted') return 'off'
  const sub = await existing()
  if (!sub || !sameKey(sub, keyBytes(publicKey))) return 'off'
  await savePushSubscription(body(sub))
  return 'on'
}

/** Keep the reminder text the service worker shows in the person's language. */
export async function storeReminderText(text: { title: string; body: string }): Promise<void> {
  try {
    const cache = await caches.open(TEXT_CACHE)
    await cache.put(TEXT_URL, new Response(JSON.stringify(text), { headers: { 'Content-Type': 'application/json' } }))
  } catch {
    // No Cache API (private mode, old browser): the reminder falls back to English.
  }
}
