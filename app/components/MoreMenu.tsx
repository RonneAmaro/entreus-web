'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bug,
  FlaskConical,
  Gift,
  HelpCircle,
  Languages,
  Lightbulb,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sun,
  Trophy,
  UserX,
  Wallet,
} from 'lucide-react'
import { useLanguage } from './LanguageProvider'
import type { LanguageCode } from '@/lib/translations'

type MoreMenuProps = {
  mounted: boolean
  theme?: string
  position?: {
    left: number
    top: number
  }
  onToggleTheme: () => void
  onLogout: () => void
  onClose: () => void
}

export default function MoreMenu({
  mounted,
  theme,
  position,
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
        ? 'bg-blue-500/15 text-blue-50 ring-1 ring-blue-300/20'
        : 'text-zinc-200 hover:bg-white/10 hover:text-white',
    ].join(' ')
  }

  function iconClass(path?: string) {
    const active = path ? isActive(path) : false
    return `h-5 w-5 shrink-0 ${active ? 'stroke-[2.5]' : ''}`
  }

  return (
    <div
      className={`${position ? 'fixed' : 'absolute bottom-full left-0 mb-3'} z-[10000] max-h-[calc(100vh-24px)] w-72 overflow-y-auto overscroll-contain rounded-3xl border border-blue-400/15 bg-zinc-950/98 p-2 text-white shadow-2xl shadow-black/40 ring-1 ring-white/10 [scrollbar-color:rgba(96,165,250,0.45)_transparent] [scrollbar-width:thin]`}
      style={position}
    >
      <div className="sticky top-0 z-10 rounded-2xl bg-zinc-950/95 px-3 py-3 backdrop-blur-xl">
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

        <Link href="/suggestions" onClick={onClose} className={itemClass('/suggestions')}>
          <Lightbulb className={iconClass('/suggestions')} />
          <span>Sugestoes</span>
        </Link>

        <Link href="/challenges" onClick={onClose} className={itemClass('/challenges')}>
          <Trophy className={iconClass('/challenges')} />
          <span>Desafios</span>
        </Link>

        <Link href="/wallet" onClick={onClose} className={itemClass('/wallet')}>
          <Wallet className={iconClass('/wallet')} />
          <span>Carteira</span>
        </Link>

        <Link href="/gifts" onClick={onClose} className={itemClass('/gifts')}>
          <Gift className={iconClass('/gifts')} />
          <span>Presentes</span>
        </Link>

        <Link href="/feedback" onClick={onClose} className={itemClass('/feedback')}>
          <Bug className={iconClass('/feedback')} />
          <span>Reportar bug</span>
        </Link>

        <div className="rounded-2xl px-4 py-3 text-sm text-zinc-200">
          <div className="mb-2 flex items-center gap-3 font-semibold">
            <Languages className="h-5 w-5 shrink-0" />
            <span>{t('language.label')}</span>
          </div>

          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as LanguageCode)}
            className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none transition focus:border-blue-400"
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

        <div className="my-2 border-t border-white/10" />

        <button
          type="button"
          onClick={() => {
            onClose()
            onLogout()
          }}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span>{t('auth.logout')}</span>
        </button>
      </div>
    </div>
  )
}
