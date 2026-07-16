'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowLeft, BarChart3, Bell, Bookmark, ChevronRight, CircleHelp, Compass, Crown,
  FilePenLine, FlaskConical, Gift, Home, LogOut, MessageCircle, Moon, Search,
  Settings, ShieldCheck, Sun, Trophy, User, Video, WalletCards, X,
} from 'lucide-react'
import { HUB_ITEMS, NAVIGATION_CATEGORY_LABELS, navigationAccentFor } from '@/lib/navigation/navigation-items'
import { searchNavigationItems } from '@/lib/navigation/navigation-search'
import { readHubUsage, recordHubUsage, type HubUsage } from '@/lib/navigation/hub-usage'
import type { NavigationAccent, NavigationCategory, NavigationIcon, NavigationItem } from '@/lib/navigation/navigation-types'
import EntreUSWordmark from './EntreUSWordmark'

const ICONS: Record<NavigationIcon, typeof Home> = {
  admin: ShieldCheck, bell: Bell, bookmark: Bookmark, challenge: Trophy,
  creator: BarChart3, editor: FilePenLine, feed: Home, gift: Gift, help: CircleHelp,
  lab: FlaskConical, meet: Video, messages: MessageCircle, profile: User,
  search: Compass, settings: Settings, vip: Crown, wallet: WalletCards,
}

const CATEGORY_ORDER: NavigationCategory[] = [
  'highlights', 'communication', 'content', 'creator', 'account', 'tools', 'administration',
]
const PINNED_IDS = new Set(['lab', 'meet', 'messages', 'wallet', 'feed', 'settings'])
const ACCENT_CLASSES: Record<NavigationAccent, string> = {
  amber: 'bg-amber-500/15 text-amber-700 ring-amber-500/20 group-hover:bg-amber-500/25 group-hover:shadow-amber-500/20 dark:text-amber-200 dark:ring-amber-300/20',
  blue: 'bg-blue-500/15 text-blue-700 ring-blue-500/20 group-hover:bg-blue-500/25 group-hover:shadow-blue-500/20 dark:text-blue-200 dark:ring-blue-300/20',
  cyan: 'bg-cyan-500/15 text-cyan-700 ring-cyan-500/20 group-hover:bg-cyan-500/25 group-hover:shadow-cyan-500/20 dark:text-cyan-200 dark:ring-cyan-300/20',
  emerald: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/20 group-hover:bg-emerald-500/25 group-hover:shadow-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-300/20',
  fuchsia: 'bg-fuchsia-500/15 text-fuchsia-700 ring-fuchsia-500/20 group-hover:bg-fuchsia-500/25 group-hover:shadow-fuchsia-500/20 dark:text-fuchsia-200 dark:ring-fuchsia-300/20',
  indigo: 'bg-indigo-500/15 text-indigo-700 ring-indigo-500/20 group-hover:bg-indigo-500/25 group-hover:shadow-indigo-500/20 dark:text-indigo-200 dark:ring-indigo-300/20',
  red: 'bg-red-500/15 text-red-700 ring-red-500/20 group-hover:bg-red-500/25 group-hover:shadow-red-500/20 dark:text-red-200 dark:ring-red-300/20',
  violet: 'bg-violet-500/15 text-violet-700 ring-violet-500/20 group-hover:bg-violet-500/25 group-hover:shadow-violet-500/20 dark:text-violet-200 dark:ring-violet-300/20',
}

type EntreUSHubProps = {
  open: boolean
  onClose: () => void
  userId: string
  isAdmin: boolean
  unreadNotificationsCount: number
  unreadMessagesCount: number
  adminPendingCount: number
  mounted: boolean
  theme?: string
  displayName?: string
  username?: string | null
  avatarUrl?: string | null
  onToggleTheme: () => void
  onLogout: () => void
}

function badgeFor(item: NavigationItem, props: EntreUSHubProps) {
  if (item.id === 'messages') return props.unreadMessagesCount
  if (item.id === 'notifications') return props.unreadNotificationsCount
  if (item.id === 'admin') return props.adminPendingCount
  return 0
}

export default function EntreUSHub(props: EntreUSHubProps) {
  const { open, onClose, userId, isAdmin } = props
  const searchRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [usage, setUsage] = useState<HubUsage>({ recent: [], counts: {} })

  const closeHub = useCallback(() => {
    setQuery('')
    setShowAll(false)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => {
      setUsage(readHubUsage(userId, window.localStorage))
      searchRef.current?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHub()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button, a, input, [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeHub, userId])

  const results = useMemo(() => searchNavigationItems(query, { authenticated: Boolean(userId), isAdmin }), [query, userId, isAdmin])
  const availableItems = useMemo(() => searchNavigationItems('', { authenticated: Boolean(userId), isAdmin }), [userId, isAdmin])
  const pinned = useMemo(() => availableItems.filter((item) => PINNED_IDS.has(item.id)), [availableItems])
  const recent = useMemo(() => usage.recent
    .map((id) => HUB_ITEMS.find((item) => item.id === id))
    .filter((item): item is NavigationItem => item !== undefined)
    .filter((item) => item.audience !== 'admin' || isAdmin), [usage, isAdmin])
  const frequent = useMemo(() => availableItems
    .filter((item) => !PINNED_IDS.has(item.id) && usage.counts[item.id])
    .sort((a, b) => (usage.counts[b.id] || 0) - (usage.counts[a.id] || 0))
    .slice(0, 4), [availableItems, usage])

  if (!open || typeof document === 'undefined') return null

  function openItem(item: NavigationItem) {
    setUsage(recordHubUsage(userId, item.id, window.localStorage))
  }

  const appLink = (item: NavigationItem, compact = false) => {
    const Icon = ICONS[item.icon]
    const badge = badgeFor(item, props)
    const accentClass = ACCENT_CLASSES[navigationAccentFor(item)]
    return (
      <Link key={item.id} href={item.href} onClick={() => openItem(item)} className={`group relative flex min-w-0 rounded-2xl text-left transition duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transform-none motion-reduce:transition-colors ${compact ? 'items-center gap-3 px-2 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.07]' : 'min-h-24 flex-col items-center justify-start gap-2 px-2 py-3 text-center hover:-translate-y-0.5 hover:bg-zinc-100 dark:hover:bg-white/[0.07] sm:min-h-28 sm:px-3 sm:py-4'}`}>
        <span className={`relative flex shrink-0 items-center justify-center shadow-lg ring-1 ring-inset transition duration-200 group-hover:-translate-y-1 group-hover:scale-[1.04] group-hover:shadow-lg group-focus-visible:-translate-y-1 group-focus-visible:scale-[1.04] motion-reduce:transform-none motion-reduce:transition-colors ${accentClass} ${compact ? 'h-10 w-10 rounded-xl' : 'h-12 w-12 rounded-2xl sm:h-14 sm:w-14'}`}><Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} />{badge > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-black leading-5 text-white">{badge > 99 ? '99+' : badge}</span>}</span>
        <span className={`min-w-0 ${compact ? '' : 'flex w-full flex-col items-center text-center'}`}><span className={`block max-w-full font-bold text-zinc-950 dark:text-white ${compact ? 'truncate text-sm' : 'min-h-8 text-xs leading-4 sm:text-sm'}`}>{item.title}</span>{!compact && <span className="mt-0.5 hidden max-w-44 text-center text-[11px] leading-4 text-zinc-600 dark:text-zinc-500 sm:line-clamp-3">{item.description}</span>}</span>
      </Link>
    )
  }

  const content = (
    <div data-testid="entreus-hub-overlay" className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-0 backdrop-blur-md sm:p-5 lg:p-8" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHub() }}>
      <div ref={dialogRef} id="entreus-hub" role="dialog" aria-modal="true" aria-labelledby="entreus-hub-title" className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-zinc-950 shadow-2xl shadow-black/30 ring-1 ring-black/10 dark:bg-zinc-950 dark:text-white dark:shadow-black/70 dark:ring-white/10 sm:h-[min(90dvh,820px)] sm:w-[min(88vw,1280px)] sm:rounded-[2rem]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_55%)]" />
        <header className="relative shrink-0 px-4 pb-3 pt-[max(env(safe-area-inset-top),16px)] sm:px-8 sm:pb-5 sm:pt-7 lg:px-10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3"><Image src="/logo-icon.png" alt="" width={48} height={48} priority className="h-11 w-11 shrink-0 rounded-full object-contain sm:h-12 sm:w-12" /><div className="min-w-0"><h2 id="entreus-hub-title" className="text-xl font-black tracking-tight sm:text-2xl"><EntreUSWordmark /></h2><p className="text-xs font-medium tracking-wide text-zinc-400 sm:text-sm">Só Entre Nós</p></div></div>
            <button type="button" onClick={closeHub} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white" aria-label="Fechar EntreUS"><X className="h-5 w-5" /></button>
          </div>
          <label className="relative mx-auto block w-full max-w-4xl"><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-600 dark:text-blue-300" /><span className="sr-only">Buscar no Hub</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aplicativos, páginas e recursos" className="h-[52px] w-full rounded-2xl border border-zinc-300 bg-zinc-100 pl-12 pr-4 text-sm text-zinc-950 shadow-inner outline-none transition placeholder:text-zinc-500 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15 dark:border-white/10 dark:bg-white/[0.07] dark:text-white dark:focus:border-blue-400/60 dark:focus:bg-white/[0.09] sm:h-14 sm:text-base" /></label>
        </header>

        <main className="relative flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-8 lg:px-10">
          {query ? (
            <section aria-live="polite" className="mx-auto max-w-5xl py-4 sm:py-6">
              <h3 className="mb-4 text-sm font-black text-zinc-200">Resultados <span className="ml-1 font-medium text-zinc-500">{results.length}</span></h3>
              {results.length === 0 ? <div className="flex min-h-52 flex-col items-center justify-center rounded-3xl bg-white/[0.025] px-6 py-12 text-center"><Search className="mb-3 h-8 w-8 text-zinc-600" /><p className="font-bold">Nenhum resultado</p><p className="mt-1 text-sm text-zinc-500">Tente outro nome, descrição ou palavra-chave.</p></div> : <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">{results.map((item) => appLink(item))}</div>}
            </section>
          ) : showAll ? (
            <div className="mx-auto max-w-6xl py-4 sm:py-6">
              <button type="button" onClick={() => setShowAll(false)} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-zinc-300 transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><ArrowLeft className="h-4 w-4" />Voltar aos fixados</button>
              <div className="grid items-start gap-x-10 gap-y-7 md:grid-cols-2">{CATEGORY_ORDER.map((category) => {
                const items = availableItems.filter((item) => item.category === category)
                if (!items.length) return null
                return <section key={category}><h3 className="mb-2 px-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">{NAVIGATION_CATEGORY_LABELS[category]}</h3><div className="grid grid-cols-2 gap-1 sm:grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]">{items.map((item) => appLink(item))}</div></section>
              })}</div>
            </div>
          ) : (
            <div className="mx-auto max-w-6xl py-4 sm:py-6">
              <section>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-base font-black sm:text-lg">Fixados</h3><button type="button" onClick={() => setShowAll(true)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-bold text-blue-700 transition hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300">Ver todos <ChevronRight className="h-4 w-4" /></button></div>
                <div data-testid="pinned-apps" className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">{pinned.map((item) => appLink(item))}</div>
              </section>
              <div className="mt-6 grid gap-6 border-t border-white/[0.07] pt-6 md:grid-cols-2">
                <section><h3 className="mb-2 text-sm font-black">Recentes</h3>{recent.length ? <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">{recent.map((item) => appLink(item, true))}</div> : <p className="border-l-2 border-white/10 px-3 py-1 text-xs leading-5 text-zinc-500">Seus acessos recentes aparecerão aqui.</p>}</section>
                <section><h3 className="mb-2 text-sm font-black">Mais utilizados</h3>{frequent.length ? <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">{frequent.map((item) => appLink(item, true))}</div> : <p className="border-l-2 border-white/10 px-3 py-1 text-xs leading-5 text-zinc-500">Os recursos que você mais usa aparecerão aqui.</p>}</section>
              </div>
            </div>
          )}
        </main>

        <footer className="relative flex shrink-0 items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/90 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl dark:border-white/[0.07] dark:bg-black/25 sm:px-8 sm:py-3 lg:px-10">
          <Link href="/profile" onClick={() => openItem(HUB_ITEMS.find((item) => item.id === 'profile')!)} className="flex min-w-0 items-center gap-3 rounded-xl p-1.5 pr-3 transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{props.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Profile media can use approved runtime hosts outside next/image config.
            <img src={props.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-200"><User className="h-4 w-4" /></span>}<span className="min-w-0"><span className="block truncate text-sm font-bold">{props.displayName || props.username || 'Meu perfil'}</span><span className="hidden text-xs text-zinc-500 sm:block">Ver perfil</span></span></Link>
          <div className="flex items-center gap-1">{props.mounted && <button type="button" onClick={props.onToggleTheme} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-300 dark:hover:bg-white/10" aria-label="Alternar tema">{props.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}<span className="hidden sm:inline">Tema</span></button>}<button type="button" onClick={() => { closeHub(); props.onLogout() }} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-red-700 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-300"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sair</span></button></div>
        </footer>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
