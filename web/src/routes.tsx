import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject } from 'react-router'
import { Placeholder } from '@/pages/Placeholder'

// Routes match docs/recheck-project-plan.md. Screens are stubs until their
// feature branches land.
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/staff/sign-in" replace /> },
  { path: '/staff/sign-in', element: <Placeholder titleKey="pages.signIn" /> },
  { path: '/staff/visits/new', element: <Placeholder titleKey="pages.enrol" /> },
  { path: '/staff/triage', element: <Placeholder titleKey="pages.triage" /> },
  { path: '/staff/visits/:id', element: <Placeholder titleKey="pages.visit" /> },
  { path: '/v/:token', element: <Placeholder titleKey="pages.patientEntry" /> },
  { path: '/check-in', element: <Placeholder titleKey="pages.checkIn" /> },
  { path: '*', element: <Placeholder titleKey="pages.notFound" /> },
]

export const createRouter = () => createBrowserRouter(routes)
export const createTestRouter = (initialEntries: string[]) => createMemoryRouter(routes, { initialEntries })
