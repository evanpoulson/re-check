import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { clearStaffSession, demoStaffSignIn, getStaffSession, type StaffSessionInfo } from '@/api/api'
import { ApiError } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import type { StaffRole } from '@/api/types'
import { Brand } from '@/components/Brand'
import { PageState } from '@/components/PageState'
import { ClipboardList, LayoutList, Plus, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The server owns the staff session: an HttpOnly cookie set by the Auth0 callback
// or the demo role picker. The app only asks who is signed in.
const STAFF_SESSION_KEY = ['staff-session'] as const

interface StaffContext {
  staff: StaffSessionInfo | null
  role: StaffRole | null
  loading: boolean
  signInDemo: (role: StaffRole) => Promise<void>
  signOut: () => Promise<void>
}
const Ctx = createContext<StaffContext | null>(null)

async function currentStaff(): Promise<StaffSessionInfo | null> {
  try {
    return await getStaffSession()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

const isDemoStaff = (staff: StaffSessionInfo) => staff.user_id.startsWith('demo|')

export function StaffProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: STAFF_SESSION_KEY, queryFn: currentStaff, retry: false, staleTime: 60_000 })
  const staff = data ?? null

  const signInDemo = useCallback(async (role: StaffRole) => {
    const info = await demoStaffSignIn(role)
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== STAFF_SESSION_KEY[0] })
    queryClient.setQueryData(STAFF_SESSION_KEY, info)
  }, [queryClient])

  const signOut = useCallback(async () => {
    if (staff && !isDemoStaff(staff)) {
      // Ends the Auth0 session too, then lands on the sign-in page.
      window.location.assign(endpoints.staffLogout())
      // The page is leaving; don't let callers navigate in the meantime.
      return new Promise<void>(() => {})
    }
    await clearStaffSession().catch(() => undefined)
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== STAFF_SESSION_KEY[0] })
    queryClient.setQueryData(STAFF_SESSION_KEY, null)
  }, [queryClient, staff])

  const value = useMemo(
    () => ({ staff, role: staff?.role ?? null, loading: isPending, signInDemo, signOut }),
    [staff, isPending, signInDemo, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStaff(): StaffContext {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStaff must be used inside StaffProvider')
  return v
}

const link = ({ isActive }: { isActive: boolean }) => cn('staff-nav-link', isActive && 'is-active')

/** Where each role starts. The charge nurse starts on the triage board and can also open the worklist. */
export function staffHome(role: StaffRole): string | null {
  if (role === 'physician') return '/staff/physician'
  if (role === 'triage_nurse' || role === 'charge_nurse') return '/staff/triage'
  return null
}

const SEES_WORKLIST: StaffRole[] = ['physician', 'charge_nurse']
const SEES_TRIAGE: StaffRole[] = ['triage_nurse', 'charge_nurse']

function StaffLoading() {
  const { t } = useTranslation()
  return (
    <main id="main-content" className="staff-page">
      <PageState loading title={t('common.loading')} />
    </main>
  )
}

/** Navigation only. The API authorizes every staff request from the session cookie. */
export function RequireStaffRole({ roles }: { roles: StaffRole[] }) {
  const { role, loading } = useStaff()
  if (loading) return <StaffLoading />
  if (!role) return <Navigate to="/staff/sign-in" replace />
  if (roles.includes(role)) return <Outlet />
  return <Navigate to={staffHome(role) ?? '/staff/sign-in'} replace />
}

export function StaffLayout() {
  const { t } = useTranslation()
  const { staff, role, loading, signOut } = useStaff()
  const navigate = useNavigate()
  if (loading) return <StaffLoading />
  if (!staff || !role) return <Navigate to="/staff/sign-in" replace />
  const home = staffHome(role) ?? '/staff/sign-in'
  return (
    <div className="staff-shell">
      <a href="#main-content" className="skip-link">{t('nav.skip')}</a>
      <header className="staff-header no-print">
        <NavLink to={home} aria-label={t('nav.home')}><Brand /></NavLink>
        <nav aria-label={t('nav.label')}>
          {SEES_WORKLIST.includes(role) && (
            <NavLink to="/staff/physician" className={link}><ClipboardList size={18} aria-hidden />{t('review.title')}</NavLink>
          )}
          {SEES_TRIAGE.includes(role) && (
            <>
              <NavLink to="/staff/triage" className={link}><LayoutList size={18} aria-hidden />{t('nav.triage')}</NavLink>
              <NavLink to="/staff/visits/new" className={link}><Plus size={18} aria-hidden />{t('nav.enrol')}</NavLink>
            </>
          )}
        </nav>
        <div className="staff-identity">
          <span className="hidden sm:inline">
            {staff.name ? t('signIn.signedInAs', { name: staff.name, role: t(`role.${role}`) }) : t(`role.${role}`)}
          </span>
          <Button variant="ghost" aria-label={t('nav.signOut')} onClick={() => {
            void signOut().then(() => navigate('/staff/sign-in'))
          }}><LogOut size={18} aria-hidden /></Button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
