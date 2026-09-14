'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LogOut, Settings, User } from 'lucide-react'

type AccountMenuProps = {
  displayName?: string
  username?: string | null
  avatarUrl?: string | null
  onLogout: () => void | Promise<void>
  variant: 'desktop' | 'mobile'
}

export default function AccountMenu({
  displayName,
  username,
  avatarUrl,
  onLogout,
  variant,
}: AccountMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const accountName = displayName || username || 'Minha conta'

  useEffect(() => {
    if (!open) return

    function closeOnPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }

    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    await onLogout()
  }

  const isMobile = variant === 'mobile'
  const triggerClassName = isMobile
    ? 'relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-bold text-zinc-500 transition active:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
    : 'absolute bottom-[max(env(safe-area-inset-bottom),16px)] left-1/2 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full text-zinc-400 ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'
  const menuClassName = isMobile
    ? 'absolute bottom-full right-0 z-[60] mb-2 w-64 rounded-2xl border border-zinc-200 bg-white p-2 text-zinc-950 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white'
    : 'absolute bottom-0 left-[calc(100%+12px)] z-50 w-64 rounded-2xl border border-zinc-200 bg-white p-2 text-zinc-950 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white'

  return (
    <div ref={containerRef} className={isMobile ? 'relative' : 'absolute bottom-0 left-0 right-0'}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label="Abrir menu da conta"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Profile media can use approved runtime hosts outside next/image config.
          <img src={avatarUrl} alt="" className={isMobile ? 'h-6 w-6 rounded-full object-cover' : 'h-9 w-9 rounded-full object-cover'} />
        ) : <User className={isMobile ? 'h-5 w-5' : 'h-5 w-5'} />}
        {isMobile && <span>Perfil</span>}
      </button>

      {open && (
        <div role="menu" aria-label="Menu da conta" className={menuClassName}>
          <div className="border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
            <p className="truncate text-sm font-black">{accountName}</p>
            {username && <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">@{username}</p>}
          </div>
          <div className="pt-1">
            <Link href="/profile" role="menuitem" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-white/10">
              <User className="h-4 w-4" />
              Meu perfil
            </Link>
            <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-white/10">
              <Settings className="h-4 w-4" />
              Configurações
            </Link>
            <button type="button" role="menuitem" onClick={handleLogout} disabled={loggingOut} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold text-red-700 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300">
              <LogOut className="h-4 w-4" />
              {loggingOut ? 'Saindo...' : 'Sair'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
