import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { Navigate, Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { clearStaffSession, demoStaffSignIn, getStaffSession, type StaffSessionInfo } from '@/api/api'
import { ApiError } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import type { StaffRole } from '@/api/types'
import { Brand } from '@/components/Brand'
import { PageState } from '@/components/PageState'
import { BellRing, ClipboardList, LayoutList, LogOut, Menu, Settings, UserRound } from 'lucide-react'
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

/** Where each role starts. The charge nurse starts on escalations and can also open the triage board and worklist. */
export function staffHome(role: StaffRole): string | null {
  if (role === 'physician') return '/staff/physician'
  if (role === 'triage_nurse') return '/staff/triage'
  if (role === 'charge_nurse') return '/staff/escalations'
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
  const onTriage = useLocation().pathname === '/staff/triage'
  if (loading) return <StaffLoading />
  if (!staff || !role) return <Navigate to="/staff/sign-in" replace />
  const home = staffHome(role) ?? '/staff/sign-in'
  return (
    <div className="staff-shell">
      <a href="#main-content" className="skip-link">{t('nav.skip')}</a>
      <header className="staff-header no-print">
        <NavLink to={home} aria-label={t('nav.home')}><Brand /></NavLink>
        <nav aria-label={t('nav.label')}>
          {/* Same order for every role, so each role's home comes first. */}
          {role === 'charge_nurse' && (
            <NavLink to="/staff/escalations" className={link}><BellRing aria-hidden className="size-[1.125rem]" />{t('nav.escalations')}</NavLink>
          )}
          {SEES_TRIAGE.includes(role) && (role === 'charge_nurse' || !onTriage) && (
            // New visit opens as a sheet from the board's own button.
            <NavLink to="/staff/triage" className={link}><LayoutList aria-hidden className="size-[1.125rem]" />{t('nav.triage')}</NavLink>
          )}
          {SEES_WORKLIST.includes(role) && (
            <NavLink to="/staff/physician" className={link}><ClipboardList aria-hidden className="size-[1.125rem]" />{t('review.title')}</NavLink>
          )}
        </nav>
        <div className="staff-identity">
          <details className="staff-menu" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
          }} onKeyDown={(event) => {
            if (event.key !== 'Escape' || !event.currentTarget.open) return
            event.currentTarget.open = false
            event.currentTarget.querySelector('summary')?.focus()
          }}>
            <summary id="staff-menu-button" aria-label={t('nav.menu')} title={t('nav.menu')}>
              <Menu aria-hidden className="size-5" />
            </summary>
            <div className="staff-menu-panel">
              <div className="staff-menu-profile">
                <UserRound aria-hidden className="size-5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">{staff.name ?? t('nav.staffProfile')}</p>
                  {staff.email && <p className="break-all text-muted">{staff.email}</p>}
                  <p className="text-muted">{t(`role.${role}`)}</p>
                </div>
              </div>
              {onTriage && SEES_TRIAGE.includes(role) && (
                <Link to="?panel=settings" preventScrollReset onClick={(event) => {
                  event.currentTarget.closest('details')!.open = false
                }}><Settings aria-hidden className="size-4" />{t('triage.settings')}</Link>
              )}
              <Button variant="ghost" onClick={() => {
                void signOut().then(() => navigate('/staff/sign-in'))
              }}><LogOut aria-hidden className="size-4" />{t('nav.signOut')}</Button>
            </div>
          </details>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
