import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { StaffRole } from '@/api/types'
import { DemoBadge } from '@/components/DemoBadge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The contract defines no staff session, so the demo role is local only. A real
// session replaces this once the backend defines one.
const KEY = 'recheck-demo-role'

interface StaffContext {
  role: StaffRole | null
  signIn: (role: StaffRole) => void
  signOut: () => void
}
const Ctx = createContext<StaffContext | null>(null)

const readRole = (): StaffRole | null => {
  try {
    return localStorage.getItem(KEY) as StaffRole | null
  } catch {
    return null
  }
}

export function StaffProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<StaffRole | null>(readRole)
  const signIn = useCallback((r: StaffRole) => {
    try {
      localStorage.setItem(KEY, r)
    } catch {
      /* in memory only */
    }
    setRole(r)
  }, [])
  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    setRole(null)
  }, [])
  const value = useMemo(() => ({ role, signIn, signOut }), [role, signIn, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStaff(): StaffContext {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStaff must be used inside StaffProvider')
  return v
}

const link = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-data px-3 py-2 font-bold', isActive ? 'bg-white text-ink' : 'text-white/85 hover:bg-white/10')

/** Chrome for every staff screen. Sends you to sign-in when no demo role is chosen. */
export function StaffLayout() {
  const { t } = useTranslation()
  const { role, signOut } = useStaff()
  const navigate = useNavigate()
  if (!role) return <Navigate to="/staff/sign-in" replace />
  return (
    <div className="min-h-dvh">
      <header className="bg-ink text-white no-print">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-xl font-extrabold tracking-tight">{t('app.name')}</span>
          <DemoBadge />
          <nav aria-label={t('nav.label')} className="flex gap-1">
            <NavLink to="/staff/triage" className={link}>
              {t('nav.triage')}
            </NavLink>
            <NavLink to="/staff/visits/new" className={link}>
              {t('nav.enrol')}
            </NavLink>
          </nav>
          <span className="ml-auto text-white/85">{t(`role.${role}`)}</span>
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10"
            onClick={() => {
              signOut()
              navigate('/staff/sign-in')
            }}
          >
            {t('nav.signOut')}
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
