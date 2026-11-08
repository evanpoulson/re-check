import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { startMocks } from './api/mocks/browser'
import './i18n'
import './index.css'
import { createRouter } from './routes'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 2000, refetchOnWindowFocus: true } } })
const router = createRouter()

// Until the FastAPI routes exist the app runs against typed mocks (see src/api/mocks).
void startMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
})
