import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Same origin as the API, as in production (nginx): the staff and patient
  // cookies and the Auth0 callback ({RECHECK_PUBLIC_URL}/api/staff/callback) need it.
  // Requests the mock service worker handles never reach the proxy.
  server: {
    proxy: { '/api': { target: process.env.RECHECK_API_URL ?? 'http://127.0.0.1:8000' } },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:3000/' } },
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
