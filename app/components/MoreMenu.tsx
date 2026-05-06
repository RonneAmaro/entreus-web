'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FlaskConical,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sun,
  UserX,
} from 'lucide-react'

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
  const pathname = usePathname()

  function isActive(path: string) {
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  function itemClass(path?: string) {
    const active = path ? isActive(path) : false

    return [
      'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition',
      active
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
        : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900',
    ].join(' ')
  }

  function iconClass(path?: string) {
    const active = path ? isActive(path) : false
    return `h-5 w-5 shrink-0 ${active ? 'stroke-[2.5]' : ''}`
  }

  return (
    <div className="absolute bottom-full left-0 z-[999] mb-3 w-72 rounded-3xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-black">
      <div className="px-3 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-400">
          Mais opções
        </p>
      </div>

      <div className="space-y-1">
        <Link
          href="/lab"
          onClick={onClose}
          className={itemClass('/lab')}
        >
          <FlaskConical className={iconClass('/lab')} />
          <div className="min-w-0">
            <p>EntreUS Lab</p>
            <p className="mt-0.5 truncate text-xs font-medium opacity-70">
              Ferramentas criativas
            </p>
          </div>
        </Link>

        <Link
          href="/privacy"
          onClick={onClose}
          className={itemClass('/privacy')}
        >
          <Shield className={iconClass('/privacy')} />
          <span>Privacidade</span>
        </Link>

        <Link
          href="/blocked"
          onClick={onClose}
          className={itemClass('/blocked')}
        >
          <UserX className={iconClass('/blocked')} />
          <span>Bloqueados</span>
        </Link>

        <Link
          href="/settings"
          onClick={onClose}
          className={itemClass('/settings')}
        >
          <Settings className={iconClass('/settings')} />
          <span>Configurações</span>
        </Link>

        {mounted && (
          <button
            type="button"
            onClick={() => {
              onToggleTheme()
              onClose()
            }}
            className={itemClass()}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5 shrink-0" />
            ) : (
              <Moon className="h-5 w-5 shrink-0" />
            )}

            <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
          </button>
        )}

        <div className="my-2 border-t border-zinc-200 dark:border-zinc-800" />

        <button
          type="button"
          onClick={() => {
            onClose()
            onLogout()
          }}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  )
}
