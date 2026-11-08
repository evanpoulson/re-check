import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/**
 * Keeps the board and open visit fresh. A DashboardEvent is only a "something
 * changed" notice, so every event simply refetches. The real transport is a
 * backend choice that is not made yet; until then a 5 second poll is the
 * fallback, and the dev mocks also post to a BroadcastChannel for instant updates.
 */
export function useDashboardEvents(): { live: boolean } {
  const qc = useQueryClient()
  const [live, setLive] = useState(() => navigator.onLine)
  useEffect(() => {
    const refetch = () => {
      void qc.invalidateQueries({ queryKey: ['board'] })
      void qc.invalidateQueries({ queryKey: ['worklist'] })
      void qc.invalidateQueries({ queryKey: ['visit'] })
    }
    const id = setInterval(refetch, 5000)
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('recheck-events')
    if (channel) channel.onmessage = refetch
    const online = () => setLive(true)
    const offline = () => setLive(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      clearInterval(id)
      channel?.close()
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [qc])
  return { live }
}
