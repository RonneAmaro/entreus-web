'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bug,
  FlaskConical,
  HelpCircle,
  Languages,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sun,
  UserX,
} from 'lucide-react'
import { useLanguage } from './LanguageProvider'
import type { LanguageCode } from '@/lib/translations'

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
  const { language, languages, setLanguage, t } = useLanguage()

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
          {t('more.title')}
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
            <p>{t('lab.name')}</p>
            <p className="mt-0.5 truncate text-xs font-medium opacity-70">
              {t('lab.subtitle')}
            </p>
          </div>
        </Link>

        <Link href="/help" onClick={onClose} className={itemClass('/help')}>
          <HelpCircle className={iconClass('/help')} />
          <span>Ajuda</span>
        </Link>

        <Link href="/feedback" onClick={onClose} className={itemClass('/feedback')}>
          <Bug className={iconClass('/feedback')} />
          <span>Reportar bug</span>
        </Link>

        <div className="rounded-2xl px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
          <div className="mb-2 flex items-center gap-3 font-semibold">
            <Languages className="h-5 w-5 shrink-0" />
            <span>{t('language.label')}</span>
          </div>

          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as LanguageCode)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 dark:border-zinc-800 dark:bg-zinc-950"
          >
            {languages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.nativeName}
              </option>
            ))}
          </select>

          <p className="mt-2 text-xs text-zinc-500">
            {t('language.helper')}
          </p>
        </div>

        <Link href="/privacy" onClick={onClose} className={itemClass('/privacy')}>
          <Shield className={iconClass('/privacy')} />
          <span>{t('settings.privacy')}</span>
        </Link>

        <Link href="/blocked" onClick={onClose} className={itemClass('/blocked')}>
          <UserX className={iconClass('/blocked')} />
          <span>{t('settings.blocked')}</span>
        </Link>

        <Link href="/settings" onClick={onClose} className={itemClass('/settings')}>
          <Settings className={iconClass('/settings')} />
          <span>{t('settings.settings')}</span>
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

            <span>{theme === 'dark' ? t('theme.light') : t('theme.dark')}</span>
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
          <span>{t('auth.logout')}</span>
        </button>
      </div>
    </div>
  )
}
