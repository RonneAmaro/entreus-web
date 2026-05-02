'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Bell,
  Bookmark,
  Compass,
  Home,
  ImagePlus,
  LogOut,
  Menu,
  Moon,
  PenLine,
  Plus,
  Settings,
  Shield,
  Sun,
  User,
  UserX,
  Video,
  X,
} from 'lucide-react'

type MobileNavigationProps = {
  email: string
  displayName?: string
  avatarUrl?: string | null
  unreadNotificationsCount?: number
  mounted: boolean
  theme?: string
  onToggleTheme: () => void
  onLogout: () => void
  onPostClick: () => void
}

function getInitial(text: string) {
  if (!text) return 'U'
  return text.slice(0, 1).toUpperCase()
}

export default function MobileNavigation({
  email,
  displayName = 'Minha conta',
  avatarUrl,
  unreadNotificationsCount = 0,
  mounted,
  theme,
  onToggleTheme,
  onLogout,
  onPostClick,
}: MobileNavigationProps) {
  const [open, setOpen] = useState(false)
  const [openPostMenu, setOpenPostMenu] = useState(false)

  function closeMenu() {
    setOpen(false)
  }

  function handlePostAction() {
    setOpenPostMenu(false)
    onPostClick()
  }

  return (
    <>
      <header className="fixed left-0 top-0 z-50 flex h-16 w-full items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-black lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          aria-label="Abrir menu do perfil"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : email ? (
            <span className="text-sm font-bold">
              {getInitial(displayName || email)}
            </span>
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>

        <Link href="/feed" className="flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="EntreUS"
            width={120}
            height={50}
            className="h-auto w-[105px] object-contain"
            priority
          />
        </Link>

        <Link
          href="/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
          aria-label="Notificações"
        >
          <Bell className="h-6 w-6" />

          {unreadNotificationsCount > 0 && (
            <span className="absolute right-1 top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
            </span>
          )}
        </Link>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            onClick={closeMenu}
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar menu"
          />

          <aside className="relative h-full w-[82%] max-w-[340px] overflow-y-auto border-r border-zinc-200 bg-white px-5 py-5 shadow-2xl dark:border-zinc-800 dark:bg-black">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-lg font-bold text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitial(displayName || email)
                  )}
                </div>

                <p className="max-w-[230px] truncate text-base font-bold text-zinc-900 dark:text-white">
                  {displayName}
                </p>

                <p className="max-w-[230px] truncate text-sm text-zinc-500">
                  {email}
                </p>
              </div>

              <button
                type="button"
                onClick={closeMenu}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900"
                aria-label="Fechar menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <nav className="space-y-1">
              <Link
                href="/profile"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <User className="h-5 w-5" />
                Meu perfil
              </Link>

              <Link
                href="/feed"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <Home className="h-5 w-5" />
                Página inicial
              </Link>

              <Link
                href="/search"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <Compass className="h-5 w-5" />
                Explorar
              </Link>

              <Link
                href="/notifications"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <Bell className="h-5 w-5" />
                Notificações
              </Link>

              <Link
                href="/saved"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <Bookmark className="h-5 w-5" />
                Salvos
              </Link>

              <div className="my-4 border-t border-zinc-200 dark:border-zinc-800" />

              <Link
                href="/privacy"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <Shield className="h-5 w-5" />
                Privacidade
              </Link>

              <Link
                href="/blocked"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <UserX className="h-5 w-5" />
                Bloqueados
              </Link>

              <Link
                href="/settings"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <Settings className="h-5 w-5" />
                Configurações
              </Link>

              {mounted && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleTheme()
                    closeMenu()
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-base font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}

                  {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-base font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut className="h-5 w-5" />
                Sair
              </button>
            </nav>
          </aside>
        </div>
      )}

      {openPostMenu && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-[1px] lg:hidden">
          <button
            type="button"
            onClick={() => setOpenPostMenu(false)}
            className="absolute inset-0"
            aria-label="Fechar opções de publicação"
          />

          <div className="absolute bottom-36 right-5 z-[80] flex flex-col items-end gap-6">
            <button
              type="button"
              onClick={handlePostAction}
              className="flex items-center gap-4 text-white"
            >
              <span className="min-w-[120px] text-right text-2xl font-semibold drop-shadow">
                Publicar
              </span>

              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-xl">
                <PenLine className="h-6 w-6" />
              </span>
            </button>

            <button
              type="button"
              onClick={handlePostAction}
              className="flex items-center gap-4 text-white"
            >
              <span className="min-w-[120px] text-right text-2xl font-semibold drop-shadow">
                Fotos
              </span>

              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-xl">
                <ImagePlus className="h-6 w-6" />
              </span>
            </button>

            <button
              type="button"
              onClick={handlePostAction}
              className="flex items-center gap-4 text-white"
            >
              <span className="min-w-[120px] text-right text-2xl font-semibold drop-shadow">
                Vídeos
              </span>

              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-xl">
                <Video className="h-6 w-6" />
              </span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpenPostMenu((current) => !current)}
        className="fixed bottom-20 right-5 z-[75] flex h-16 w-16 items-center justify-center rounded-full bg-blue-500 text-white shadow-2xl transition hover:bg-blue-400 active:scale-95 dark:bg-blue-500 lg:hidden"
        aria-label="Abrir opções de publicação"
      >
        {openPostMenu ? (
          <X className="h-8 w-8" />
        ) : (
          <Plus className="h-9 w-9" />
        )}
      </button>

      <nav className="fixed bottom-0 left-0 z-50 grid h-16 w-full grid-cols-4 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black lg:hidden">
        <Link
          href="/feed"
          className="flex items-center justify-center text-zinc-800 dark:text-zinc-100"
          aria-label="Página inicial"
        >
          <Home className="h-7 w-7" />
        </Link>

        <Link
          href="/search"
          className="flex items-center justify-center text-zinc-800 dark:text-zinc-100"
          aria-label="Explorar"
        >
          <Compass className="h-7 w-7" />
        </Link>

        <Link
          href="/notifications"
          className="relative flex items-center justify-center text-zinc-800 dark:text-zinc-100"
          aria-label="Notificações"
        >
          <Bell className="h-7 w-7" />

          {unreadNotificationsCount > 0 && (
            <span className="absolute right-8 top-2 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
            </span>
          )}
        </Link>

        <Link
          href="/profile"
          className="flex items-center justify-center text-zinc-800 dark:text-zinc-100"
          aria-label="Perfil"
        >
          <User className="h-7 w-7" />
        </Link>
      </nav>
    </>
  )
}