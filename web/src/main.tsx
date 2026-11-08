import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './i18n'
import './index.css'
import { createRouter } from './routes'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 2000, refetchOnWindowFocus: true } } })
const router = createRouter()

// Until the FastAPI routes exist the app runs against typed mocks (src/api/mocks).
// They load on demand, so a build with VITE_USE_MOCKS=false does not ship them.
async function boot() {
  if (import.meta.env.VITE_USE_MOCKS !== 'false') {
    const { startMocks } = await import('./api/mocks/browser')
    await startMocks()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}
void boot()
