import { Info } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A small info button with a tooltip. It opens on hover, on keyboard focus and on tap,
 * and closes on Escape, on blur or on a tap elsewhere. The text stays in the DOM, so a
 * screen reader reads it as the button's description even while it is hidden.
 *
 * The tooltip hangs below the nearest positioned ancestor (give the card `relative`), so
 * it can sit under a whole card instead of covering what the card shows. It is nudged
 * sideways to stay 16px inside the viewport.
 */
export function InfoTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const [shift, setShift] = useState(0)
  const id = useId()
  const root = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!open || !tip.current) return setShift(0)
    const margin = 16
    const r = tip.current.getBoundingClientRect()
    if (r.left < margin) setShift(margin - r.left)
    else if (r.right > window.innerWidth - margin) setShift(window.innerWidth - margin - r.right)
    else setShift(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <span ref={root} className="inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        // A 32px target whose negative margins keep it from adding height or inset to the row.
        className={cn(
          'flex size-8 items-center justify-center rounded-full text-answer transition-colors hover:bg-canvas hover:text-muted',
          className,
        )}
      >
        <Info aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
      <span
        ref={tip}
        role="tooltip"
        id={id}
        hidden={!open}
        style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        className="absolute top-full right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-ink p-2.5 text-left text-note leading-snug font-normal text-white shadow-lg"
      >
        {children}
      </span>
    </span>
  )
}
