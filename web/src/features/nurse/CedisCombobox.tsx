import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { CedisEntry } from '@/api/cedis'
import { matchCedis } from '@/lib/enrol'
import { cn } from '@/lib/utils'

/**
 * CEDIS code picker: an editable combobox with a list popup (WAI-ARIA APG
 * pattern). Type a code or part of a complaint name; Down and Up move through
 * the list, Enter picks, Escape closes (and a second Escape clears). The field
 * still accepts any typed code, so codes outside the map work as before.
 */
export function CedisCombobox({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  invalid: boolean
  describedBy: string
}) {
  const { t } = useTranslation()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const options = matchCedis(value)
  const activeId = open && active >= 0 && active < options.length ? `${listId}-${active}` : undefined

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  function choose(entry: CedisEntry) {
    onChange(entry.code)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) {
          setOpen(true)
          if (!e.altKey) setActive(0)
        } else setActive((a) => Math.min(a + 1, options.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) {
          setOpen(true)
          setActive(options.length - 1)
        } else setActive((a) => Math.max(a - 1, 0))
        break
      case 'Enter':
        // Pick the highlighted option instead of submitting the form.
        if (open && activeId) {
          e.preventDefault()
          choose(options[active]!)
        }
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          setOpen(false)
          setActive(-1)
        } else if (value) {
          e.preventDefault()
          onChange('')
        }
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        className="field"
        value={value}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false)
          setActive(-1)
        }}
      />
      <div className={cn('absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-card', !open && 'hidden')}>
        <ul id={listId} role="listbox" aria-label={t('enrol.cedisList')} className="max-h-64 overflow-y-auto py-1">
          {options.map((entry, i) => (
            <li
              key={entry.code}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Mouse down, not click: picking must happen before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(entry)
              }}
              onMouseMove={() => setActive(i)}
              className={cn('flex min-h-11 cursor-pointer items-center gap-3 px-3.5 py-2 text-small', i === active && 'bg-brand-50')}
            >
              <span className="tabular w-9 shrink-0 font-semibold">{entry.code}</span>
              <span className="min-w-0">{entry.name}</span>
            </li>
          ))}
        </ul>
        {options.length === 0 && <p className="px-3.5 py-3 text-small text-muted">{t('enrol.cedisNoMatch')}</p>}
      </div>
    </div>
  )
}
