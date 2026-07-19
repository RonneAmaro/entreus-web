'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  NAVIGATION_START_EVENT,
  type NavigationStartDetail,
} from '@/lib/navigation/navigation-feedback'

type PendingNavigation = NavigationStartDetail & {
  sourcePathname: string
}

export default function NavigationProgress() {
  const pathname = usePathname()
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  const pathnameRef = useRef(pathname)
  const visiblePending = pending?.sourcePathname === pathname ? pending : null

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    const onNavigationStart = (event: Event) => {
      const detail = (event as CustomEvent<NavigationStartDetail>).detail
      if (!detail?.href || !detail.title) return
      setPending({ ...detail, sourcePathname: pathnameRef.current })
    }

    window.addEventListener(NAVIGATION_START_EVENT, onNavigationStart)
    return () => window.removeEventListener(NAVIGATION_START_EVENT, onNavigationStart)
  }, [])

  useEffect(() => {
    if (!pending) return
    const timeout = window.setTimeout(() => setPending(null), 12_000)
    return () => window.clearTimeout(timeout)
  }, [pending])

  if (!visiblePending) return null

  return (
    <div
      data-testid="navigation-progress"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[12000] h-0.5 overflow-hidden bg-brand/15"
    >
      <span className="absolute inset-y-0 left-0 w-1/3 animate-[entreus-navigation-progress_1.1s_ease-in-out_infinite] bg-brand shadow-[0_0_10px_var(--brand-light)] motion-reduce:w-2/3 motion-reduce:animate-none" />
      <span className="sr-only">Abrindo {visiblePending.title}</span>
    </div>
  )
}
