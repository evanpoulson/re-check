import { useQuery } from '@tanstack/react-query'
import { BellRing, Share } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPushConfig } from '@/api/api'
import { Button } from '@/components/ui/button'
import {
  currentReminders,
  reminderSupport,
  storeReminderText,
  turnOffReminders,
  turnOnReminders,
  type ReminderSupport,
} from '@/lib/push'

type State = 'checking' | 'off' | 'on' | 'blocked' | 'failed' | 'busy'

/**
 * "Turn on reminders" on the patient home. The phone then buzzes when a check-in
 * is due, even with the page closed. Hidden when the server sends no reminders.
 * On an iPhone in Safari it explains Add to Home Screen, the only way iOS allows
 * reminders from a website.
 */
export function Reminders({ support = reminderSupport() }: { support?: ReminderSupport }) {
  const { t, i18n } = useTranslation()
  const { data: config } = useQuery({ queryKey: ['push'], queryFn: getPushConfig, retry: false, staleTime: Infinity })
  const key = config?.enabled ? config.public_key : null
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    if (!key || support !== 'supported') return
    let live = true
    currentReminders(key)
      .then((s) => live && setState(s))
      .catch(() => live && setState('off'))
    return () => {
      live = false
    }
  }, [key, support])

  // The service worker shows the reminder in the language chosen here.
  useEffect(() => {
    if (key && support === 'supported')
      void storeReminderText({ title: t('reminders.notificationTitle'), body: t('reminders.notificationBody') })
  }, [key, support, t, i18n.language])

  if (!key || support === 'unsupported') return null

  if (support === 'needs-home-screen') {
    return (
      <section className="patient-reminders" aria-labelledby="reminders-title">
        <h2 id="reminders-title" className="flex items-center gap-2">
          <BellRing aria-hidden className="size-5 shrink-0 text-brand-500" />
          {t('reminders.homeScreenTitle')}
        </h2>
        <ol className="mt-2 list-decimal space-y-1 ps-6 text-base">
          <li>
            {t('reminders.homeScreen1')} <Share aria-hidden className="inline size-4 align-text-top" />
          </li>
          <li>{t('reminders.homeScreen2')}</li>
          <li>{t('reminders.homeScreen3')}</li>
        </ol>
      </section>
    )
  }

  async function turnOn() {
    setState('busy')
    try {
      setState(await turnOnReminders(key!))
    } catch {
      setState('failed')
    }
  }
  async function turnOff() {
    setState('busy')
    try {
      await turnOffReminders()
      setState('off')
    } catch {
      setState('on')
    }
  }

  return (
    <section className="patient-reminders" aria-labelledby="reminders-title">
      <h2 id="reminders-title" className="flex items-center gap-2">
        <BellRing aria-hidden className="size-5 shrink-0 text-brand-500" />
        {t('reminders.title')}
      </h2>
      <div role="status" className="mt-1 text-base">
        {state === 'on' && <p>{t('reminders.on')}</p>}
        {(state === 'off' || state === 'checking' || state === 'busy') && <p className="text-muted">{t('reminders.hint')}</p>}
        {state === 'blocked' && <p>{t('reminders.blocked')}</p>}
        {state === 'failed' && <p>{t('reminders.failed')}</p>}
      </div>
      {state === 'on' ? (
        <>
          <p className="mt-1 text-small text-muted">{t('reminders.courtesy')}</p>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => void turnOff()}>
            {t('reminders.turnOff')}
          </Button>
        </>
      ) : (
        state !== 'blocked' && (
          <Button variant="secondary" className="mt-3 w-full" disabled={state === 'checking' || state === 'busy'} onClick={() => void turnOn()}>
            {t('reminders.turnOn')}
          </Button>
        )
      )}
    </section>
  )
}
