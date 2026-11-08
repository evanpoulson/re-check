import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CircleAlert, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { getSignInOptions } from '@/api/api'
import { endpoints } from '@/api/endpoints'
import type { StaffRole } from '@/api/types'
import { Brand } from '@/components/Brand'
import { DemoBadge } from '@/components/DemoBadge'
import { PageState } from '@/components/PageState'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/lib/page'
import { staffHome, useStaff } from './staff'

const DEMO_ROLES = ['triage_nurse', 'physician', 'charge_nurse'] as const satisfies readonly StaffRole[]
// The codes the API's Auth0 callback sends back as ?error=.
const ERRORS = ['access_denied', 'no_staff_role', 'expired', 'sign_in_failed'] as const

function errorKey(code: string | null): string | null {
  if (!code) return null
  return `signIn.error.${(ERRORS as readonly string[]).includes(code) ? code : 'sign_in_failed'}`
}

export function SignIn() {
  const { t } = useTranslation()
  const { staff, role, loading, signInDemo, signOut } = useStaff()
  const [params, setParams] = useSearchParams()
  const [demoError, setDemoError] = useState(false)
  const [busy, setBusy] = useState(false)
  const options = useQuery({ queryKey: ['sign-in-options'], queryFn: getSignInOptions, retry: false, staleTime: Infinity })
  const error = errorKey(params.get('error'))
  usePageTitle(t('pages.signIn'))

  // An Auth0 error return with an old demo session still set: end that session
  // so the error shows here instead of a redirect to the old role's home.
  useEffect(() => {
    if (error && staff?.user_id.startsWith('demo|')) void signOut()
  }, [error, staff, signOut])

  if (loading) return <main className="mx-auto max-w-md px-4 py-16"><PageState loading title={t('common.loading')} /></main>

  const home = role ? staffHome(role) : null
  if (staff && home && !error) return <Navigate to={home} replace />

  const auth0 = options.data?.auth0 ?? false
  const demo = options.data?.demo ?? false

  return (
    <main id="main-content" className="mx-auto max-w-md px-4 py-16 sm:py-24">
      <div className="mb-10 flex flex-col items-center gap-4 text-center">
        <Brand />
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t('pages.signIn')}</h1>
        <p className="max-w-md text-lg text-muted">{t(auth0 ? 'signIn.explain' : 'signIn.explainDemo')}</p>
        <DemoBadge />
      </div>

      {(error || demoError) && (
        <p role="alert" className="mb-6 flex items-start gap-2 rounded-xl border border-level-red bg-surface p-4 text-level-red">
          <CircleAlert aria-hidden size={20} className="mt-0.5 shrink-0" />
          {t(demoError ? 'signIn.error.demo' : error!)}
        </p>
      )}

      {staff && !home ? (
        <div className="grid gap-3 text-center">
          <p>{t('signIn.noPages', { role: t(`role.${staff.role}`) })}</p>
          <Button variant="secondary" size="lg" onClick={() => void signOut()}>{t('nav.signOut')}</Button>
        </div>
      ) : options.isPending ? (
        <PageState loading title={t('common.loading')} />
      ) : options.isError ? (
        <PageState title={t('signIn.optionsFailed')} retry={() => void options.refetch()} />
      ) : (
        <div className="grid gap-8">
          {auth0 && (
            <div className="grid gap-2">
              <Button size="lg" className="justify-between" onClick={() => window.location.assign(endpoints.staffLogin('/staff/sign-in'))}>
                {t('signIn.auth0')} <LogIn size={18} aria-hidden />
              </Button>
              <p className="text-center text-sm text-muted">{t('signIn.auth0Hint')}</p>
            </div>
          )}
          {demo && (
            <section aria-labelledby="demo-roles" className="grid gap-3">
              <h2 id="demo-roles" className="text-center text-base font-semibold text-muted">
                {t(auth0 ? 'signIn.demoHeading' : 'signIn.demoRoles')}
              </h2>
              {DEMO_ROLES.map((r) => (
                <Button key={r} variant="secondary" size="lg" className="justify-between" disabled={busy} onClick={() => {
                  setBusy(true)
                  setDemoError(false)
                  // Clear an old ?error= so the new session redirects to its home.
                  if (error) setParams({}, { replace: true })
                  // On success the session changes and this page redirects to the role's home.
                  signInDemo(r).catch(() => setDemoError(true)).finally(() => setBusy(false))
                }}>
                  {t(`signIn.open.${r}`)} <ArrowRight size={18} aria-hidden />
                </Button>
              ))}
            </section>
          )}
          {!auth0 && !demo && <PageState title={t('signIn.unavailable')} />}
        </div>
      )}
    </main>
  )
}
