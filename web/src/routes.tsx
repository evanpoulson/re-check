import { createBrowserRouter, createMemoryRouter, Navigate, Outlet, type RouteObject } from 'react-router'
import { Physician } from '@/features/nurse/Physician'
import { Enrol } from '@/features/nurse/Enrol'
import { SignIn } from '@/features/nurse/SignIn'
import { RequireStaffRole, StaffLayout, StaffProvider } from '@/features/nurse/staff'
import { Triage } from '@/features/nurse/Triage'
import { AssessmentPage } from '@/features/nurse/visit/AssessmentPage'
import { ManagementPage } from '@/features/nurse/visit/ManagementPage'
import { OverviewPage } from '@/features/nurse/visit/OverviewPage'
import { TimelinePage } from '@/features/nurse/visit/TimelinePage'
import { VisitLayout } from '@/features/nurse/visit/VisitLayout'
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
          { element: <RequireStaffRole role="physician" />, children: [
            { path: '/staff/physician', element: <Physician /> },
          ] },
          { element: <RequireStaffRole role="triage_nurse" />, children: [
            { path: '/staff/triage', element: <Triage /> },
            { path: '/staff/visits/new', element: <Enrol /> },
          ] },
          {
            path: '/staff/visits/:id',
            element: <VisitLayout />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'assessment', element: <AssessmentPage /> },
              { path: 'timeline', element: <TimelinePage /> },
              { path: 'manage', element: <ManagementPage /> },
            ],
          },
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
