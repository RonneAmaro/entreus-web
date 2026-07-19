'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MessageCircle, PenLine, User } from 'lucide-react'
import type { ComposeIntent } from '@/lib/compose-intent'
import { isNavigationItemActive } from '@/lib/navigation/navigation-search'
import { useAdminPendingAlerts } from '../hooks/useAdminPendingAlerts'
import { useNavigationRuntime } from '../hooks/useNavigationRuntime'
import EntreUSHub from './EntreUSHub'
import EntreUSWordmark from './EntreUSWordmark'
import { useLanguage } from './LanguageProvider'

type MobileNavigationProps = {
  email: string
  displayName?: string
  avatarUrl?: string | null
  unreadNotificationsCount?: number
  unreadMessagesCount?: number
  mounted: boolean
  theme?: string
  onToggleTheme: () => void
  onLogout: () => void
  onPostClick: (intent?: ComposeIntent) => void
}

export default function MobileNavigation({
  displayName,
  avatarUrl,
  unreadNotificationsCount = 0,
  unreadMessagesCount,
  mounted,
  theme,
  onToggleTheme,
  onLogout,
  onPostClick,
}: MobileNavigationProps) {
  const pathname = usePathname()
  const { t } = useLanguage()
  const hubButtonRef = useRef<HTMLButtonElement>(null)
  const [hubOpen, setHubOpen] = useState(false)
  const [mobileActive, setMobileActive] = useState(false)
  const runtime = useNavigationRuntime(mobileActive, unreadMessagesCount)
  const { totalPending: adminPendingCount } = useAdminPendingAlerts({ enabled: mobileActive && runtime.isAdmin })

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)')
    const update = () => setMobileActive(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  function closeHub() {
    setHubOpen(false)
    window.requestAnimationFrame(() => hubButtonRef.current?.focus())
  }

  const itemClass = (active: boolean) => `relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${active ? 'text-blue-300' : 'text-zinc-500 active:bg-white/10'}`
  const badge = runtime.unreadMessages > 0 ? <span className="absolute left-1/2 top-0 ml-2 min-w-4 rounded-full bg-red-600 px-1 text-center text-[9px] font-black leading-4 text-white">{runtime.unreadMessages > 99 ? '99+' : runtime.unreadMessages}</span> : null

  return (
    <>
      <nav aria-label={t('nav.mainLabel')} className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 items-end border-t border-zinc-200 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),4px)] pt-1 backdrop-blur-xl dark:border-white/10 dark:bg-black/95 lg:hidden">
        <Link href="/feed" className={itemClass(isNavigationItemActive(pathname, '/feed'))} aria-label={t('nav.home')} aria-current={isNavigationItemActive(pathname, '/feed') ? 'page' : undefined}><Home className="h-5 w-5" /><span>{t('nav.home')}</span></Link>
        <Link href="/messages" className={itemClass(isNavigationItemActive(pathname, '/messages'))} aria-label={t('nav.messages')} aria-current={isNavigationItemActive(pathname, '/messages') ? 'page' : undefined}><span className="relative"><MessageCircle className="h-5 w-5" />{badge}</span><span>{t('nav.messages')}</span></Link>
        <button ref={hubButtonRef} type="button" onClick={() => setHubOpen(true)} aria-label={t('nav.openHub')} aria-expanded={hubOpen} aria-controls="entreus-hub" data-active={hubOpen} className="relative -mt-5 flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-[10px] font-black text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-zinc-100"><span className="entreus-hub-trigger flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 shadow-lg shadow-blue-500/30 data-[active=true]:ring-2 data-[active=true]:ring-blue-200/80" data-active={hubOpen}><Image src="/logo-icon.png" alt="" width={34} height={34} className="h-8 w-8 rounded-full object-contain" /></span><EntreUSWordmark /></button>
        <Link href="/profile" className={itemClass(isNavigationItemActive(pathname, '/profile'))} aria-label={t('nav.profile')} aria-current={isNavigationItemActive(pathname, '/profile') ? 'page' : undefined}>{avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Profile media can use approved runtime hosts outside next/image config.
          <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : <User className="h-5 w-5" />}<span>{t('nav.profile')}</span></Link>
        <button type="button" onClick={() => onPostClick('text')} className={itemClass(false)} aria-label={t('nav.post')}><PenLine className="h-5 w-5" /><span>{t('nav.post')}</span></button>
      </nav>

      <EntreUSHub open={hubOpen} onClose={closeHub} userId={runtime.userId} isAdmin={runtime.isAdmin} unreadNotificationsCount={unreadNotificationsCount} unreadMessagesCount={runtime.unreadMessages} adminPendingCount={adminPendingCount} mounted={mounted} theme={theme} displayName={displayName} avatarUrl={avatarUrl} onToggleTheme={onToggleTheme} onLogout={onLogout} />
    </>
  )
}
