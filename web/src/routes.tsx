import { createBrowserRouter, createMemoryRouter, Navigate, Outlet, type RouteObject } from 'react-router'
import { Enrol } from '@/features/nurse/Enrol'
import { SignIn } from '@/features/nurse/SignIn'
import { StaffLayout, StaffProvider } from '@/features/nurse/staff'
import { Triage } from '@/features/nurse/Triage'
import { VisitDetailPage } from '@/features/nurse/VisitDetailPage'
import { CheckIn } from '@/features/patient/CheckIn'
import { Exchange } from '@/features/patient/Exchange'
import { Placeholder } from '@/pages/Placeholder'

// Routes match docs/recheck-project-plan.md.
export const routes: RouteObject[] = [
  {
    element: (
      <StaffProvider>
        <Outlet />
      </StaffProvider>
    ),
    children: [
      { path: '/', element: <Navigate to="/staff/sign-in" replace /> },
      { path: '/staff/sign-in', element: <SignIn /> },
      {
        element: <StaffLayout />,
        children: [
          { path: '/staff/triage', element: <Triage /> },
          { path: '/staff/visits/new', element: <Enrol /> },
          { path: '/staff/visits/:id', element: <VisitDetailPage /> },
        ],
      },
    ],
  },
  { path: '/v/:token', element: <Exchange /> },
  { path: '/check-in', element: <CheckIn /> },
  { path: '*', element: <Placeholder titleKey="pages.notFound" /> },
]

export const createRouter = () => createBrowserRouter(routes)
export const createTestRouter = (initialEntries: string[]) => createMemoryRouter(routes, { initialEntries })
