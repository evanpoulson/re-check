import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusStart(panel: HTMLElement | null, labelledBy: string) {
  const heading = panel?.querySelector<HTMLElement>(`#${CSS.escape(labelledBy)}`)
  if (heading) {
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  } else panel?.focus({ preventScroll: true })
}

/**
 * A modal sheet that slides in from the right over a dimmed page (Apple style).
 * While it is open the rest of the page is inert, so focus and screen readers stay
 * inside; Tab also wraps at either end. Escape, the round close button or a click on
 * the backdrop closes it, and focus goes back to `returnFocus`.
 *
 * The sheet itself scrolls (`.sheet-body`), so content inside can scroll its own top
 * into view with `closest('.sheet-body')`.
 */
export function Sheet({
  labelledBy,
  closeLabel,
  onClose,
  returnFocus,
  children,
}: {
  labelledBy: string
  closeLabel: string
  onClose: () => void
  /** Where focus goes when the sheet closes: the control that opened it. */
  returnFocus: () => HTMLElement | null
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const back = useRef(returnFocus)
  useLayoutEffect(() => {
    back.current = returnFocus
  })
  const [host] = useState(() => {
    const el = document.createElement('div')
    el.className = 'sheet-host'
    return el
  })

  // Mount the host, make everything else inert and stop the page behind from scrolling.
  useLayoutEffect(() => {
    const el = host
    document.body.appendChild(el)
    const others = Array.from(document.body.children).filter((c) => c !== el && !(c as HTMLElement).inert) as HTMLElement[]
    others.forEach((c) => (c.inert = true))
    const html = document.documentElement
    const overflow = html.style.overflow
    html.style.overflow = 'hidden'
    // Focus that lands outside the sheet anyway (page code focusing a heading) comes back in.
    const keepFocus = (e: FocusEvent) => {
      if (!el.contains(e.target as Node)) focusStart(panel.current, labelledBy)
    }
    document.addEventListener('focusin', keepFocus)
    return () => {
      document.removeEventListener('focusin', keepFocus)
      others.forEach((c) => (c.inert = false))
      html.style.overflow = overflow
      el.remove()
      back.current()?.focus({ preventScroll: true })
    }
  }, [host, labelledBy])

  // Focus the sheet's heading first, so a screen reader announces what opened.
  useEffect(() => focusStart(panel.current, labelledBy), [labelledBy])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // A control that used Escape itself (an open list) calls preventDefault.
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const list = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden]'))
    if (list.length === 0) return
    const first = list[0]!
    const last = list[list.length - 1]!
    const at = document.activeElement
    if (e.shiftKey && (at === first || !panel.current.contains(at) || at === panel.current.querySelector(`#${CSS.escape(labelledBy)}`))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && at === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="sheet-root" onKeyDown={onKeyDown}>
      <div className="sheet-backdrop no-print" aria-hidden onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className="sheet">
        <button type="button" className="sheet-close no-print" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          <X aria-hidden className="size-5" strokeWidth={2.25} />
        </button>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    host,
  )
}
