import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { StaffRole } from '@/api/types'
import { DemoBadge } from '@/components/DemoBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useStaff } from './staff'

const ROLES: StaffRole[] = ['triage_nurse', 'physician', 'charge_nurse', 'quality']
// Demo navigation does not provide staff authorization.
const AVAILABLE: StaffRole[] = ['triage_nurse', 'physician']

export function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useStaff()
  const navigate = useNavigate()
  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-3xl font-extrabold tracking-tight">{t('pages.signIn')}</h1>
        <DemoBadge onLight />
      </div>
      <p className="mb-4 text-muted">{t('signIn.explain')}</p>
      <div className="space-y-3">
        {ROLES.map((role) => {
          const ok = AVAILABLE.includes(role)
          return (
            <Card key={role} className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{t(`role.${role}`)}</div>
                {!ok && <div className="text-sm text-muted">{t('signIn.notInBuild')}</div>}
              </div>
              <Button
                disabled={!ok}
                onClick={() => {
                  signIn(role)
                  navigate(role === 'physician' ? '/staff/physician' : '/staff/triage')
                }}
              >
                {t('signIn.continue')}
              </Button>
            </Card>
          )
        })}
      </div>
    </main>
  )
}
