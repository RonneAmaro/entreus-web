'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  Bookmark,
  Compass,
  Home,
  MoreHorizontal,
  PenLine,
  User,
} from 'lucide-react'
import MoreMenu from './MoreMenu'

type AppSidebarProps = {
  unreadNotificationsCount?: number
  mounted: boolean
  theme?: string
  onToggleTheme: () => void
  onLogout: () => void
}

export default function AppSidebar({
  unreadNotificationsCount = 0,
  mounted,
  theme,
  onToggleTheme,
  onLogout,
}: AppSidebarProps) {
  const pathname = usePathname()
  const [openMoreMenu, setOpenMoreMenu] = useState(false)

  function handlePostClick() {
    const composer = document.getElementById('post-composer')

    if (composer) {
      composer.scrollIntoView({ behavior: 'smooth', block: 'center' })

      const textarea = composer.querySelector('textarea')

      if (textarea instanceof HTMLTextAreaElement) {
        setTimeout(() => textarea.focus(), 350)
      }
    }
  }

  function isActive(path: string) {
    if (path === '/feed') {
      return pathname === '/feed' || pathname === '/'
    }

    return pathname === path || pathname.startsWith(`${path}/`)
  }

  function navLinkClass(path: string) {
    const active = isActive(path)

    return [
      'flex items-center gap-4 rounded-full px-4 py-3 text-lg font-medium transition',
      active
        ? 'bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
        : 'text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900',
    ].join(' ')
  }

  function navIconClass(path: string) {
    return `h-6 w-6 shrink-0 ${isActive(path) ? 'stroke-[2.5]' : ''}`
  }

  const isMoreActive =
    pathname === '/privacy' ||
    pathname === '/blocked' ||
    pathname === '/settings'

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[270px] flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black lg:flex">
      <div className="flex h-full flex-col overflow-y-auto px-5 py-5">
        <Link
          href="/feed"
          className="mb-8 flex w-full shrink-0 items-center justify-center"
          aria-label="Ir para a página inicial da EntreUS"
        >
          <div className="flex w-full justify-center">
            <Image
              src="/logo.png"
              alt="Logo EntreUS"
              width={220}
              height={180}
              className="mx-auto block h-auto w-full max-w-[185px] object-contain"
              priority
            />
          </div>
        </Link>

        <nav className="flex flex-col gap-2 pb-4">
          <Link href="/feed" className={navLinkClass('/feed')}>
            <Home className={navIconClass('/feed')} />
            <span>Página inicial</span>
          </Link>

          <Link href="/search" className={navLinkClass('/search')}>
            <Compass className={navIconClass('/search')} />
            <span>Explorar</span>
          </Link>

          <Link href="/notifications" className={`relative ${navLinkClass('/notifications')}`}>
            <div className="relative shrink-0">
              <Bell className={navIconClass('/notifications')} />

              {unreadNotificationsCount > 0 && (
                <span className="absolute -right-2 -top-2 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                </span>
              )}
            </div>

            <span>Notificações</span>
          </Link>

          <Link href="/saved" className={navLinkClass('/saved')}>
            <Bookmark className={navIconClass('/saved')} />
            <span>Salvos</span>
          </Link>

          <Link href="/profile" className={navLinkClass('/profile')}>
            <User className={navIconClass('/profile')} />
            <span>Perfil</span>
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMoreMenu((current) => !current)}
              className={[
                'flex w-full items-center gap-4 rounded-full px-4 py-3 text-lg font-medium transition',
                isMoreActive
                  ? 'bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
                  : 'text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900',
              ].join(' ')}
            >
              <MoreHorizontal className={`h-6 w-6 shrink-0 ${isMoreActive ? 'stroke-[2.5]' : ''}`} />
              <span>Mais</span>
            </button>

            {openMoreMenu && (
              <>
                <button
                  type="button"
                  onClick={() => setOpenMoreMenu(false)}
                  className="fixed inset-0 z-[998] cursor-default bg-transparent"
                  aria-label="Fechar menu"
                />

                <MoreMenu
                  mounted={mounted}
                  theme={theme}
                  onToggleTheme={onToggleTheme}
                  onLogout={onLogout}
                  onClose={() => setOpenMoreMenu(false)}
                />
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handlePostClick}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-base font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
          >
            <PenLine className="h-5 w-5 shrink-0" />
            <span>Postar</span>
          </button>
        </nav>

        <div className="mt-auto rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <p className="font-bold tracking-tight text-zinc-900 dark:text-white">
            Entre<span className="text-blue-500">US</span>
          </p>

          <p>Só Entre Nós</p>
        </div>
      </div>
    </aside>
  )
}