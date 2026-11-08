import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { staffHome, useStaff } from './staff'

const roles = ['triage_nurse', 'physician'] as const

export function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useStaff()
  const navigate = useNavigate()
  return (
    <main className="mx-auto max-w-md px-5 py-12 sm:py-20">
      <Brand />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">{t('pages.signIn')}</h1>
      <p className="mt-2 text-muted">{t('signIn.explain')}</p>
      <div className="mt-6 grid gap-3">
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
