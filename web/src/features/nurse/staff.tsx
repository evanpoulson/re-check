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
    const role = sessionStorage.getItem(KEY)
    return role === 'physician' || role === 'triage_nurse' ? role : null
  } catch {
    return null
  }
}

export function StaffProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<StaffRole | null>(readRole)
  const signIn = useCallback((r: StaffRole) => {
    try {
      sessionStorage.setItem(KEY, r)
    } catch {
      /* in memory only */
    }
    setRole(r)
  }, [])
  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY)
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
export const staffHome = (role: StaffRole) => role === 'physician' ? '/staff/physician' : '/staff/triage'

export function RequireStaffRole({ role: allowed }: { role: StaffRole }) {
  const { role } = useStaff()
  if (!role) return <Navigate to="/staff/sign-in" replace />
  return role === allowed ? <Outlet /> : <Navigate to={staffHome(role)} replace />
}

/** This controls demo navigation. The service must authorize staff requests. */
export function StaffLayout() {
  const { t } = useTranslation()
  const { role, signOut } = useStaff()
  const navigate = useNavigate()
  if (!role) return <Navigate to="/staff/sign-in" replace />
  return (
    <div className="staff-shell">
      <a href="#main-content" className="skip-link">{t('nav.skip')}</a>
      <header className="staff-header no-print">
        <NavLink to={staffHome(role)} aria-label={t('nav.home')}><Brand /></NavLink>
        <nav aria-label={t('nav.label')}>
          {role === 'physician' ? (
            <NavLink to="/staff/physician" className={link}><ClipboardList size={18} aria-hidden />{t('review.title')}</NavLink>
          ) : (
            <>
              <NavLink to="/staff/triage" className={link}><LayoutList size={18} aria-hidden />{t('nav.triage')}</NavLink>
              <NavLink to="/staff/visits/new" className={link}><Plus size={18} aria-hidden />{t('nav.enrol')}</NavLink>
            </>
          )}
        </nav>
        <div className="staff-identity">
          <span>{t('nav.synthetic')}</span>
          <Button variant="ghost" aria-label={t('nav.changeRole')} onClick={() => {
            signOut()
            navigate('/staff/sign-in')
          }}><LogOut size={18} aria-hidden /></Button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
