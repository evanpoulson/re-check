import { useEffect } from 'react'

/** Sets the tab title to "<title> – Recheck" (WCAG 2.4.2). Pass null while the page has no name yet. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} – Recheck`
  }, [title])
}

/** Moves screen-reader focus to the page's heading without scrolling or drawing a focus box. */
export function focusHeading(heading: HTMLElement | null | undefined): boolean {
  if (!heading) return false
  heading.tabIndex = -1
  heading.focus({ preventScroll: true })
  return true
}

/**
 * Focuses the page's <h1> once it renders. Pages that load data show a spinner
 * first, so this waits (up to a few seconds) for the heading to appear.
 * Returns a cleanup that stops waiting.
 */
export function focusPageHeadingWhenReady(timeoutMs = 4000): () => void {
  const find = () => document.querySelector<HTMLElement>('main h1')
  if (focusHeading(find())) return () => undefined
  const observer = new MutationObserver(() => {
    if (focusHeading(find())) stop()
  })
  const timer = window.setTimeout(() => stop(), timeoutMs)
  function stop() {
    observer.disconnect()
    window.clearTimeout(timer)
  }
  observer.observe(document.body, { childList: true, subtree: true })
  return stop
}
