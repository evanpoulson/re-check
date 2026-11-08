import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { StaffRole } from '@/api/types'
import { Brand } from '@/components/Brand'
import { ClipboardList, LayoutList, Plus, LogOut } from 'lucide-react'
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

const link = ({ isActive }: { isActive: boolean }) => cn('staff-nav-link', isActive && 'is-active')

/** Demo navigation only; the backend must authorize every staff action. */
export function StaffLayout() {
  const { t } = useTranslation()
  const { role, signOut } = useStaff()
  const navigate = useNavigate()
  if (!role) return <Navigate to="/staff/sign-in" replace />
  return (
    <div className="staff-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="staff-header no-print">
        <LinkBrand />
        <nav aria-label={t('nav.label')}>
          <NavLink to="/staff/physician" className={link}>
            <ClipboardList size={18} aria-hidden />
            Review worklist
          </NavLink>
          <NavLink to="/staff/triage" className={link}>
            <LayoutList size={18} aria-hidden />
            {t('nav.triage')}
          </NavLink>
          <NavLink to="/staff/visits/new" className={link}>
            <Plus size={18} aria-hidden />
            {t('nav.enrol')}
          </NavLink>
        </nav>
        <div className="staff-identity">
          <span>{t(`role.${role}`)}</span>
          <Button
            variant="ghost"
            aria-label="Change demo role"
            onClick={() => {
              signOut()
              navigate('/staff/sign-in')
            }}
          >
            <LogOut size={18} aria-hidden />
          </Button>
        </div>
      </header>
      <section aria-label="Demo context" className="demo-strip">
        <span>Synthetic demo</span>
        <span>Emergency department · Waiting-room follow-up</span>
        <span>Demo role · not staff authentication</span>
      </section>
      <Outlet />
    </div>
  )
}
function LinkBrand() {
  return (
    <NavLink to="/staff/physician" aria-label="Recheck review worklist">
      <Brand />
    </NavLink>
  )
}
