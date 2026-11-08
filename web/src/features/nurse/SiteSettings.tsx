import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { getSiteSettings, updateSiteSettings } from '@/api/api'
import type { SiteSettings } from '@/api/types'
import { ChevronRight, Settings } from 'lucide-react'

/**
 * A rare, site-wide admin switch, so it sits in a collapsed "Site settings"
 * disclosure below the board rather than in the board's working area.
 *
 * Site-wide switch for showing patients the level set at triage. Off by default
 * (research brief §4a). Patient screens pick up a change on their next refetch.
 */
export function SiteSettingsCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const helpId = useId()
  const settings = useQuery({ queryKey: ['site-settings'], queryFn: getSiteSettings })
  const save = useMutation({
    mutationFn: (on: boolean) => updateSiteSettings({ show_triage_level: on }),
    onSuccess: (saved) => qc.setQueryData<SiteSettings>(['site-settings'], saved),
  })
  if (!settings.data) return null
  const on = save.isPending ? save.variables : settings.data.show_triage_level

  return (
    <details className="group rounded-card bg-surface shadow-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-card px-5 py-3 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted transition-transform group-open:rotate-90 rtl:-scale-x-100" />
        <Settings aria-hidden className="size-4 text-muted" />
        {t('siteSettings.disclosure')}
      </summary>
      <div className="space-y-2 border-t border-line px-5 pt-3 pb-5">
        <h2 className="eyebrow text-muted">{t('siteSettings.title')}</h2>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem] font-medium">
          <input
            type="checkbox"
            role="switch"
            className="size-5 accent-brand-500"
            checked={on}
            disabled={save.isPending}
            aria-describedby={helpId}
            onChange={(e) => save.mutate(e.target.checked)}
          />
          {t('siteSettings.showLevel')}
          {save.isPending && <span className="text-muted">{t('siteSettings.saving')}</span>}
        </label>
        <p id={helpId} className="text-sm text-muted">{t('siteSettings.showLevelHelp')}</p>
        {save.isError && <p role="alert" className="text-sm font-semibold text-level-red">{t('siteSettings.failed')}</p>}
      </div>
    </details>
  )
}
