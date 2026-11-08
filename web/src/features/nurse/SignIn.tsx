import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { StaffRole } from '@/api/types'
import { DemoBadge } from '@/components/DemoBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useStaff } from './staff'

const ROLES: StaffRole[] = ['triage_nurse', 'physician', 'charge_nurse', 'quality']
// Only the triage nurse screens are part of this build.
const AVAILABLE: StaffRole[] = ['triage_nurse']

export function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useStaff()
  const navigate = useNavigate()
  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:py-24">
      <div className="mb-10 flex flex-col items-center gap-4 text-center">
        <span className="text-lg font-semibold tracking-tight">{t('app.name')}</span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t('pages.signIn')}</h1>
        <p className="max-w-md text-lg text-muted">{t('signIn.explain')}</p>
        <DemoBadge />
      </div>
      <Card className="divide-y divide-line p-0">
        {ROLES.map((role) => {
          const ok = AVAILABLE.includes(role)
          return (
            <div key={role} className="flex items-center justify-between gap-3 px-6 py-5">
              <div>
                <div className={ok ? 'text-lg font-semibold' : 'text-lg font-semibold text-muted'}>{t(`role.${role}`)}</div>
                {!ok && <div className="text-sm text-muted">{t('signIn.notInBuild')}</div>}
              </div>
              <Button
                disabled={!ok}
                onClick={() => {
                  signIn(role)
                  navigate('/staff/triage')
                }}
              >
                {t('signIn.continue')}
              </Button>
            </div>
          )
        })}
      </Card>
    </main>
  )
}
