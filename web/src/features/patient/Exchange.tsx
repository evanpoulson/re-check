import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { exchangeToken } from '@/api/api'
import { ApiError } from '@/api/client'
import type { Role, SignInConflict } from '@/api/types'
import { AnswerButton } from '@/components/AnswerButton'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { clock, isolate } from '@/lib/time'
import { PatientLayout } from './PatientLayout'

type State =
  | { name: 'choose' }
  | { name: 'sending'; role: Role }
  | { name: 'conflict'; role: Role; conflict: SignInConflict }
  | { name: 'inactive' }
  | { name: 'failed'; role: Role }

/**
 * /v/:token. The visit's one QR: whoever scans it says who they are, then gets
 * a session. Only one device is signed in per visit, so if another is, ask
 * before signing it out, and only take over after the person confirms.
 */
export function Exchange() {
  const { t, i18n } = useTranslation()
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ name: 'choose' })
  const titleKey = state.name === 'inactive' ? 'exchange.expired.title' : state.name === 'conflict' ? 'exchange.takeover.title' : 'exchange.who'
  useEffect(() => { document.title = `${t(titleKey)} · Recheck` }, [titleKey, t])

  async function signIn(role: Role, takeover?: string) {
    setState({ name: 'sending', role })
    try {
      const session = await exchangeToken({ token, role, ...(takeover ? { takeover_session_id: takeover } : {}) })
      void i18n.changeLanguage(session.language)
      navigate('/check-in', { replace: true })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Someone is signed in (or took over meanwhile): ask again with the current state.
        setState({ name: 'conflict', role, conflict: e.body as SignInConflict })
      } else if (e instanceof ApiError && (e.status === 404 || e.status === 410 || e.status === 422)) {
        setState({ name: 'inactive' })
      } else {
        setState({ name: 'failed', role })
      }
    }
  }

  if (state.name === 'inactive') {
    return (
      <PatientLayout>
        {/* There is no way to check a code without signing in, so this shows after the role is picked.
            A short heading, then the instruction in body text. */}
        <Card role="alert" className="space-y-3">
          <h1 className="text-heading font-semibold leading-tight tracking-tight">{t('exchange.expired.title')}</h1>
          <p>{t('exchange.expired.help')}</p>
          <p className="font-semibold">{t('exchange.help')}</p>
        </Card>
      </PatientLayout>
    )
  }

  if (state.name === 'conflict') {
    const { conflict, role } = state
    return (
      <PatientLayout>
        <Card className="space-y-5">
          <h1 className="text-heading font-semibold leading-tight tracking-tight">{t('exchange.takeover.title')}</h1>
          <p>
            {t('exchange.takeover.who', {
              who: t(`exchange.signedInAs.${conflict.signed_in_as}`),
              time: isolate(clock(conflict.signed_in_since, i18n.language)),
            })}
          </p>
          <div className="grid gap-3">
            <Button size="lg" onClick={() => void signIn(role, conflict.session_id)}>
              {t('exchange.takeover.confirm')}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => setState({ name: 'choose' })}>
              {t('exchange.takeover.cancel')}
            </Button>
          </div>
        </Card>
      </PatientLayout>
    )
  }

  const sending = state.name === 'sending'
  return (
    <PatientLayout about>
      <section aria-labelledby="who" className="space-y-6 pt-4">
        <div className="space-y-3 text-center">
          <h1 id="who" className="text-heading font-semibold leading-tight tracking-tight">
            {t('exchange.who')}
          </h1>
          <p className="text-base text-muted">{t('exchange.intro')}</p>
        </div>
        <div className="grid gap-3">
          {(['patient', 'companion'] as const).map((role) => (
            <div key={role} className="space-y-1">
              <AnswerButton
                selected={sending && state.role === role}
                disabled={sending}
                aria-describedby={role === 'companion' ? 'companion-hint' : undefined}
                onClick={() => void signIn(role)}
              >
                {t(`exchange.role.${role}`)}
              </AnswerButton>
              {role === 'companion' && (
                <p id="companion-hint" className="px-5 text-base text-muted">{t('exchange.companionHint')}</p>
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-base font-semibold">{t('exchange.help')}</p>
        {sending && <p role="status" className="text-center text-muted">{t('pages.patientEntry')}</p>}
        {state.name === 'failed' && (
          <p role="alert" className="rounded-card bg-level-red-bg px-5 py-3 font-semibold text-level-red">
            {t('exchange.failed')}
          </p>
        )}
      </section>
    </PatientLayout>
  )
}
