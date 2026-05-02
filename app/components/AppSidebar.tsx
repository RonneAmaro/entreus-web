'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
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

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[270px] flex-col border-r border-zinc-200 bg-white px-5 py-5 dark:border-zinc-800 dark:bg-black lg:flex">
      <Link href="/feed" className="mb-8 flex items-center">
        <Image
          src="/logo.png"
          alt="Logo EntreUS"
          width={180}
          height={80}
          className="h-auto w-[160px] object-contain"
          priority
        />
      </Link>

      <nav className="flex flex-1 flex-col gap-2">
        <Link
          href="/feed"
          className="flex items-center gap-4 rounded-full px-4 py-3 text-lg font-medium text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          <Home className="h-6 w-6" />
          <span>Página inicial</span>
        </Link>

        <Link
          href="/search"
          className="flex items-center gap-4 rounded-full px-4 py-3 text-lg font-medium text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          <Compass className="h-6 w-6" />
          <span>Explorar</span>
        </Link>

        <Link
          href="/notifications"
          className="relative flex items-center gap-4 rounded-full px-4 py-3 text-lg font-medium text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          <div className="relative">
            <Bell className="h-6 w-6" />

            {unreadNotificationsCount > 0 && (
              <span className="absolute -right-2 -top-2 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            )}
          </div>

          <span>Notificações</span>
        </Link>

        <Link
          href="/saved"
          className="flex items-center gap-4 rounded-full px-4 py-3 text-lg font-medium text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          <Bookmark className="h-6 w-6" />
          <span>Salvos</span>
        </Link>

        <Link
          href="/profile"
          className="flex items-center gap-4 rounded-full px-4 py-3 text-lg font-medium text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          <User className="h-6 w-6" />
          <span>Perfil</span>
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMoreMenu((current) => !current)}
            className="flex w-full items-center gap-4 rounded-full px-4 py-3 text-lg font-medium text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <MoreHorizontal className="h-6 w-6" />
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
          <PenLine className="h-5 w-5" />
          <span>Postar</span>
        </button>
      </nav>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        EntreUS
        <br />
        Só Entre Nós
      </div>
    </aside>
  )
}