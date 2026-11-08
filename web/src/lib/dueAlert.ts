import { useEffect, useRef, useState } from 'react'

/**
 * In-page alert for when a check-in comes due while the page is open: a short
 * chime, a vibration where the phone allows it (not iPhone), and a flashing tab
 * title until the person comes back. Web Push covers the page being closed.
 * Browsers mute sound until the person has tapped the page once, so the chime
 * is best effort.
 */

let audio: AudioContext | null = null

/** Browsers start audio suspended; the first tap or key press lets the chime play later. */
function unlockAudio() {
  const resume = () => {
    try {
      audio ??= new AudioContext()
      void audio.resume()
    } catch {
      // No Web Audio: the vibration and title still work.
    }
  }
  window.addEventListener('pointerdown', resume, { once: true, capture: true })
  window.addEventListener('keydown', resume, { once: true, capture: true })
}

function chime() {
  try {
    audio ??= new AudioContext()
    const ctx = audio
    void ctx.resume()
    // Two soft rising tones, 0.6 s in all.
    ;[660, 880].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.25
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.32)
    })
  } catch {
    // Audio isn't available; the other signals still fire.
  }
}

/** Alternate the tab title with the message until the person is looking at the page, or 5 minutes. */
function flashTitle(message: string): () => void {
  const original = document.title
  let on = false
  const started = Date.now()
  const looking = () => document.visibilityState === 'visible' && document.hasFocus()
  const stop = () => {
    clearInterval(id)
    window.removeEventListener('pointerdown', stop, true)
    window.removeEventListener('keydown', stop, true)
    document.title = original
  }
  const id = setInterval(() => {
    // Keep flashing for a few seconds even when the page is in view, then stop once it is.
    if (Date.now() - started > 5 * 60_000 || (Date.now() - started > 6000 && looking())) return stop()
    on = !on
    document.title = on ? message : original
  }, 1000)
  window.addEventListener('pointerdown', stop, true)
  window.addEventListener('keydown', stop, true)
  return stop
}

export function alertDue(message: string): () => void {
  chime()
  try {
    navigator.vibrate?.([200, 100, 200])
  } catch {
    // Not allowed without a tap first in some browsers.
  }
  return flashTitle(message)
}

/**
 * Fires once when `due` passes while the page is open. A check-in that was
 * already due when the page loaded doesn't alert: the screen shows it. Returns
 * whether the alert has fired for the current due time, for a live announcement.
 */
export function useDueAlert(due: string | null | undefined, message: string, alert: (m: string) => () => void = alertDue): boolean {
  const [firedFor, setFiredFor] = useState<string | null>(null)
  const messageRef = useRef(message)
  useEffect(() => {
    messageRef.current = message
  }, [message])
  useEffect(unlockAudio, [])
  useEffect(() => {
    if (!due) return
    const ms = Date.parse(due) - Date.now()
    if (!(ms > 0)) return
    let stop: (() => void) | undefined
    // Timers longer than about 24.8 days overflow; a check-in is never that far off.
    const id = setTimeout(() => {
      setFiredFor(due)
      stop = alert(messageRef.current)
    }, Math.min(ms, 2 ** 31 - 1))
    return () => {
      clearTimeout(id)
      stop?.()
    }
  }, [due, alert])
  return firedFor !== null && firedFor === due
}
