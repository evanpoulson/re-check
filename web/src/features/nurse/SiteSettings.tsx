import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { getSiteSettings, updateSiteSettings } from '@/api/api'
import type { SiteSettings } from '@/api/types'

/**
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
    <section className="space-y-2 border-t border-line pt-4" aria-label={t('siteSettings.title')}>
      <h3 className="text-title font-semibold">{t('siteSettings.title')}</h3>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-small font-medium">
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
      <p id={helpId} className="text-small text-muted">{t('siteSettings.showLevelHelp')}</p>
      {save.isError && <p role="alert" className="text-small font-semibold text-level-red">{t('siteSettings.failed')}</p>}
    </section>
  )
}
