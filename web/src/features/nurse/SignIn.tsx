import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Brand } from '@/components/Brand'
import { DemoBadge } from '@/components/DemoBadge'
import { Button } from '@/components/ui/button'
import { staffHome, useStaff } from './staff'

const roles = ['triage_nurse', 'physician'] as const

export function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useStaff()
  const navigate = useNavigate()
  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:py-24">
      <div className="mb-10 flex flex-col items-center gap-4 text-center">
        <Brand />
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t('pages.signIn')}</h1>
        <p className="max-w-md text-lg text-muted">{t('signIn.explain')}</p>
        <DemoBadge />
      </div>
      <div className="grid gap-3">
        {roles.map((role) => (
          <Button key={role} variant="secondary" size="lg" className="justify-between" onClick={() => {
            signIn(role)
            navigate(staffHome(role))
          }}>
            {t(`signIn.open.${role}`)} <ArrowRight size={18} aria-hidden />
          </Button>
        ))}
      </div>
    </main>
  )
}
