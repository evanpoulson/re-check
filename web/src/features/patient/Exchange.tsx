import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { exchangeToken } from '@/api/api'
import { ApiError } from '@/api/client'
import { Card } from '@/components/ui/card'
import { PatientLayout } from './PatientLayout'

/** /v/:token. Trades the single-use token for a session, then opens the check-in. */
export function Exchange() {
  const { t, i18n } = useTranslation()
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<'expired' | 'invalid' | null>(null)
  // A token is single use, so exchange it exactly once even if the effect re-runs.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    exchangeToken({ token })
      .then((session) => {
        void i18n.changeLanguage(session.language)
        navigate('/check-in', { replace: true })
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 410 ? 'expired' : 'invalid'))
  }, [token, navigate, i18n])

  return (
    <PatientLayout>
      {error ? (
        <Card role="alert" className="space-y-2 text-center">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{t(`exchange.${error}.title`)}</h1>
          <p className="text-muted">{t('exchange.askDesk')}</p>
        </Card>
      ) : (
        <h1 role="status" className="py-16 text-center text-[1.75rem] font-semibold leading-tight tracking-tight text-muted">{t('pages.patientEntry')}</h1>
      )}
    </PatientLayout>
  )
}
