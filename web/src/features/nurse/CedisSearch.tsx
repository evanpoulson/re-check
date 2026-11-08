import { useEffect, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cedisEntries, lookupCedis, type CedisEntry } from '@/api/cedis'

export function CedisSearch({ value, onChange, error }: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const term = value.trim().toLowerCase()
  const mapped = lookupCedis(term)
  const matches = !mapped
    ? cedisEntries.filter(({ code, name }) => code.startsWith(term) || name.toLowerCase().includes(term))
    : []
  const expanded = open && matches.length > 0
  const activeId = expanded && matches[active] ? `cedis-option-${matches[active].code}` : undefined

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  function close() {
    setOpen(false)
    setActive(-1)
  }

  function select(entry: CedisEntry) {
    onChange(entry.code)
    close()
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      close()
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActive((index) => {
        if (!expanded) return event.key === 'ArrowDown' ? 0 : matches.length - 1
        if (event.key === 'ArrowDown') return Math.min(index + 1, matches.length - 1)
        return index < 0 ? matches.length - 1 : Math.max(0, index - 1)
      })
    }
    if (event.key === 'Enter' && activeId) {
      event.preventDefault()
      select(matches[active]!)
    }
  }

  return (
    <div>
      <label htmlFor="cedis" className="enrol-label">{t('enrol.cedis')}</label>
      <div className="relative">
        <input id="cedis" type="text" className="field" value={value}
          role="combobox" aria-autocomplete="list" aria-expanded={expanded}
          aria-controls={expanded ? 'cedis-list' : undefined} aria-activedescendant={activeId}
          aria-invalid={!!error} aria-describedby={error ? 'cedis-help cedis-error' : 'cedis-help'}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onBlur={close} onKeyDown={keyDown} />
        {expanded && (
          <ul id="cedis-list" role="listbox" aria-label={t('enrol.cedisSuggestions')}
            className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-card">
            {matches.map((entry, index) => (
              <li key={entry.code} id={`cedis-option-${entry.code}`} role="option" aria-selected={active === index}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-canvas aria-selected:bg-brand-50"
                onMouseDown={(event) => event.preventDefault()} onClick={() => select(entry)}>
                <span className="tabular font-semibold">{entry.code}</span>
                <span>{entry.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id="cedis-help" className="enrol-help">
        {mapped ? `${mapped.code}: ${mapped.name}` : t('enrol.cedisHelp')}
      </p>
      {error && <p id="cedis-error" className="enrol-error">{error}</p>}
    </div>
  )
}
