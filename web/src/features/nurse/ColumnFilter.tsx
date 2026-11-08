import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * A filter menu in a table header (WAI-ARIA APG menu button). The header label is the
 * button; it opens a menu of checkable choices. Up and Down move, Home and End jump,
 * Enter or Space toggles and keeps the menu open, Escape closes it and returns focus to
 * the button, and Tab or a click outside closes it. The menu is fixed to the viewport,
 * so the table's scroll box never clips it.
 */
export function ColumnFilter({
  label,
  options,
  selected,
  counts,
  renderOption,
  onToggle,
  onClear,
  align = 'start',
}: {
  label: string
  options: readonly string[]
  selected: readonly string[]
  counts: Record<string, number>
  renderOption: (value: string) => ReactNode
  onToggle: (value: string) => void
  onClear: () => void
  align?: 'start' | 'end'
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // Which item takes focus when the menu opens: the first, or the last (opened with Up).
  const start = useRef<'first' | 'last'>('first')
  const menuId = useId()
  const descId = useId()
  const active = selected.length > 0

  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) button.current?.focus()
  }

  function show(from: 'first' | 'last') {
    start.current = from
    setOpen(true)
  }

  // Place the menu under the button, kept 16px inside the viewport, and follow it while the page scrolls.
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const b = button.current?.getBoundingClientRect()
      const m = menu.current
      if (!b || !m) return
      const width = m.offsetWidth
      const margin = 16
      const wanted = align === 'end' ? b.right - width : b.left
      const left = Math.max(margin, Math.min(wanted, window.innerWidth - margin - width))
      setPos({ top: b.bottom + 6, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const list = items()
    ;(start.current === 'last' ? list[list.length - 1] : list[0])?.focus({ preventScroll: true })
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLElement)
    const move = (n: number) => {
      e.preventDefault()
      list[(n + list.length) % list.length]?.focus()
    }
    if (e.key === 'ArrowDown') move(i + 1)
    else if (e.key === 'ArrowUp') move(i - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(list.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    } else if (e.key === 'Tab') close(false)
  }

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      show(e.key === 'ArrowUp' ? 'last' : 'first')
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-describedby={descId}
        onClick={() => (open ? close(false) : show('first'))}
        onKeyDown={onButtonKey}
        className={cn('column-filter', active && 'is-active')}
      >
        {label}
        {/* Filtered, the count badge takes the chevron's place, so the header keeps its width. */}
        {active ? (
          <span className="column-filter-count tabular" aria-hidden>{selected.length}</span>
        ) : (
          <ChevronDown aria-hidden className={cn('size-[1.1em] shrink-0 transition-transform', open && 'rotate-180')} />
        )}
      </button>
      <span id={descId} hidden>
        {active ? t('triage.filter.describeActive', { count: selected.length }) : t('triage.filter.describe')}
      </span>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={t('triage.filter.menu', { column: label })}
          onKeyDown={onMenuKey}
          className="filter-menu"
          style={pos ?? { top: -9999, left: 0 }}
        >
          {options.map((value) => {
            const on = selected.includes(value)
            return (
              <button
                key={value}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                tabIndex={-1}
                onClick={() => onToggle(value)}
                className="filter-menu-item"
              >
                <Check aria-hidden className={cn('size-4 shrink-0 text-brand-600', !on && 'invisible')} />
                <span className="min-w-0 flex-1">{renderOption(value)}</span>
                <span className="tabular text-note text-muted">{counts[value] ?? 0}</span>
              </button>
            )
          })}
          <div role="separator" className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={!active}
            onClick={() => {
              if (!active) return
              onClear()
              close(true)
            }}
            className="filter-menu-item text-brand-600 aria-disabled:cursor-default aria-disabled:text-muted"
          >
            <span aria-hidden className="size-4 shrink-0" />
            {t('triage.filter.showAll')}
          </button>
        </div>
      )}
    </>
  )
}
