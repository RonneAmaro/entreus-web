'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, MessageCircle, PenLine, User } from 'lucide-react'
import { COMPOSE_ACTION_EVENT, getComposeHref } from '@/lib/compose-intent'
import { isNavigationItemActive } from '@/lib/navigation/navigation-search'
import { useAdminPendingAlerts } from '../hooks/useAdminPendingAlerts'
import { useNavigationRuntime } from '../hooks/useNavigationRuntime'
import EntreUSHub from './EntreUSHub'
import { useLanguage } from './LanguageProvider'

type AppSidebarProps = {
  unreadNotificationsCount?: number
  unreadMessagesCount?: number
  mounted: boolean
  theme?: string
  displayName?: string
  username?: string | null
  email?: string
  avatarUrl?: string | null
  onToggleTheme: () => void
  onLogout: () => void
}

export default function AppSidebar({
  unreadNotificationsCount = 0,
  unreadMessagesCount,
  mounted,
  theme,
  displayName,
  username,
  avatarUrl,
  onToggleTheme,
  onLogout,
}: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()
  const hubButtonRef = useRef<HTMLButtonElement>(null)
  const [hubOpen, setHubOpen] = useState(false)
  const [desktopActive, setDesktopActive] = useState(false)
  const runtime = useNavigationRuntime(desktopActive, unreadMessagesCount)
  const { totalPending: adminPendingCount } = useAdminPendingAlerts({ enabled: desktopActive && runtime.isAdmin })

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktopActive(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  function closeHub() {
    setHubOpen(false)
    window.requestAnimationFrame(() => hubButtonRef.current?.focus())
  }

  function post() {
    if (pathname === '/feed') {
      window.dispatchEvent(new CustomEvent(COMPOSE_ACTION_EVENT, { detail: { intent: 'text' } }))
      router.replace(getComposeHref('text'), { scroll: false })
    } else router.push(getComposeHref('text'))
  }

  const linkClass = (href: string) => `group relative flex h-12 w-12 items-center justify-center rounded-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${isNavigationItemActive(pathname, href) ? 'bg-blue-500/15 text-blue-700 ring-1 ring-blue-400/20 dark:bg-blue-500/20 dark:text-blue-100' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-white/10 dark:hover:text-white'}`
  const badge = (count: number) => count > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-black leading-5 text-white">{count > 99 ? '99+' : count}</span> : null

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] border-r border-zinc-200 bg-white/95 backdrop-blur-xl dark:border-blue-400/10 dark:bg-black/95 lg:block">
        <Link href="/feed" aria-label={t('nav.openFeed')} className="absolute left-1/2 top-4 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          <Image src="/logo-icon.png" alt="" width={40} height={40} priority className="h-10 w-10 rounded-full object-contain" />
        </Link>

        <nav aria-label={t('nav.mainLabel')} className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 xl:gap-3">
          <Link href="/feed" className={linkClass('/feed')} aria-label={t('nav.home')} aria-current={isNavigationItemActive(pathname, '/feed') ? 'page' : undefined} title={t('nav.home')}><Home className="h-5 w-5" /></Link>
          <Link href="/messages" className={linkClass('/messages')} aria-label={t('nav.messages')} aria-current={isNavigationItemActive(pathname, '/messages') ? 'page' : undefined} title={t('nav.messages')}><MessageCircle className="h-5 w-5" />{badge(runtime.unreadMessages)}</Link>
          <button ref={hubButtonRef} type="button" onClick={() => setHubOpen(true)} aria-label={t('nav.openHub')} aria-expanded={hubOpen} aria-controls="entreus-hub" data-active={hubOpen} title="EntreUS" className="relative flex h-14 w-14 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 data-[active=true]:ring-2 data-[active=true]:ring-blue-200/80"><span className="entreus-hub-trigger flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-blue-700 text-white shadow-lg shadow-blue-500/25" data-active={hubOpen}><Image src="/logo-icon.png" alt="" width={38} height={38} className="h-9 w-9 rounded-full object-contain" /></span></button>
          <Link href="/profile" className={linkClass('/profile')} aria-label={t('nav.profile')} aria-current={isNavigationItemActive(pathname, '/profile') ? 'page' : undefined} title={t('nav.profile')}>{avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Profile media can use approved runtime hosts outside next/image config.
            <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : <User className="h-5 w-5" />}</Link>
          <button type="button" onClick={post} aria-label={t('nav.post')} title={t('nav.post')} className="flex h-12 w-12 items-center justify-center rounded-2xl text-zinc-500 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><PenLine className="h-5 w-5" /></button>
        </nav>

        <Link href="/profile" aria-label={displayName ? t('nav.openUserProfile', { name: displayName }) : t('nav.openMyProfile')} title={displayName || username || t('nav.profile')} className="absolute bottom-[max(env(safe-area-inset-bottom),16px)] left-1/2 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full text-zinc-400 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Profile media can use approved runtime hosts outside next/image config.
          <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : <User className="h-5 w-5" />}</Link>
      </aside>

      <EntreUSHub open={hubOpen} onClose={closeHub} userId={runtime.userId} isAdmin={runtime.isAdmin} unreadNotificationsCount={unreadNotificationsCount} unreadMessagesCount={runtime.unreadMessages} adminPendingCount={adminPendingCount} mounted={mounted} theme={theme} displayName={displayName} username={username} avatarUrl={avatarUrl} onToggleTheme={onToggleTheme} onLogout={onLogout} />
    </>
  )
}
