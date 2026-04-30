'use client'

import Link from 'next/link'
import { LogOut, Moon, Shield, Sun, UserX } from 'lucide-react'

type MoreMenuProps = {
  mounted: boolean
  theme?: string
  onToggleTheme: () => void
  onLogout: () => void
  onClose: () => void
}

export default function MoreMenu({
  mounted,
  theme,
  onToggleTheme,
  onLogout,
  onClose,
}: MoreMenuProps) {
  function handleThemeClick() {
    onToggleTheme()
    onClose()
  }

  function handleLogoutClick() {
    onClose()
    onLogout()
  }

  return (
    <div className="absolute left-0 top-12 z-[999] w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
      {mounted && (
        <button
          type="button"
          onClick={handleThemeClick}
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-800 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}

          <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
        </button>
      )}

      <Link
        href="/privacy"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-800 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        <Shield className="h-5 w-5" />
        <span>Privacidade</span>
      </Link>

      <Link
        href="/blocked"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-800 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        <UserX className="h-5 w-5" />
        <span>Bloqueados</span>
      </Link>

      <button
        type="button"
        onClick={handleLogoutClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
      >
        <LogOut className="h-5 w-5" />
        <span>Sair</span>
      </button>
    </div>
  )
}