import { useEffect, useRef } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { focusPageHeadingWhenReady } from '@/lib/page'

const visitOf = (path: string) => path.match(/^\/staff\/visits\/([^/]+)/)?.[1] ?? null

/**
 * Root of every route. New pages open at the top and Back restores the old
 * position (ScrollRestoration). After a page change, focus moves to the new
 * page's <h1> so a screen reader announces it. Switching tabs on the same
 * visit keeps focus on the tab the person chose.
 */
export function AppFrame() {
  const { pathname } = useLocation()
  const previous = useRef<string | null>(null)

  useEffect(() => {
    const from = previous.current
    previous.current = pathname
    if (from === null || from === pathname) return
    const visit = visitOf(pathname)
    if (visit && visit === visitOf(from)) return
    return focusPageHeadingWhenReady()
  }, [pathname])

  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
