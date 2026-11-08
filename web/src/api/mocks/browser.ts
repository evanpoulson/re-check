import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

/** Mocks are on unless VITE_USE_MOCKS=false. Turn them off once the FastAPI routes exist. */
export const mocksEnabled = () => import.meta.env.VITE_USE_MOCKS !== 'false'

export async function startMocks() {
  if (!mocksEnabled()) return
  await setupWorker(...handlers).start({ onUnhandledFrame: 'bypass', quiet: true })
}
