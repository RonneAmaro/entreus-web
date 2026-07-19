import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  HUB_ITEMS,
  PRIMARY_NAVIGATION,
  isNavigationItemAvailable,
  isNavigationRouteItem,
  navigationAccentFor,
} from '../../lib/navigation/navigation-items'
import { filterNavigationItems, isNavigationItemActive, normalizeNavigationSearch, searchNavigationItems } from '../../lib/navigation/navigation-search'
import { readHubUsage, recordHubUsage } from '../../lib/navigation/hub-usage'

const access = { authenticated: true, isAdmin: false }

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

describe('responsive navigation and EntreUS Hub', () => {
  it('keeps the five official actions in their product order', () => {
    expect(PRIMARY_NAVIGATION.map((item) => item.title)).toEqual(['Casa', 'Mensagens', 'EntreUS', 'Perfil', 'Postar'])
    expect(PRIMARY_NAVIGATION.map((item) => item.kind)).toEqual(['link', 'link', 'hub', 'link', 'action'])
  })

  it('points actions to existing routes and keeps the Hub as an action', () => {
    expect(PRIMARY_NAVIGATION[0]).toMatchObject({ href: '/feed' })
    expect(PRIMARY_NAVIGATION[1]).toMatchObject({ href: '/messages' })
    expect(PRIMARY_NAVIGATION[2]).not.toHaveProperty('href')
    expect(PRIMARY_NAVIGATION[3]).toMatchObject({ href: '/profile' })
  })

  it('keeps Lab and Meet fixed and highlighted', () => {
    expect(HUB_ITEMS.filter((item) => item.highlighted).map((item) => item.id)).toEqual(['lab', 'meet'])
    expect(HUB_ITEMS.find((item) => item.id === 'lab')?.href).toBe('/lab')
    expect(HUB_ITEMS.find((item) => item.id === 'meet')?.href).toBe('/meet')
  })

  it('centralizes functional accents with a safe fallback', () => {
    expect(HUB_ITEMS.every((item) => item.accent)).toBe(true)
    expect(navigationAccentFor(HUB_ITEMS.find((item) => item.id === 'lab')!)).toBe('cyan')
    expect(navigationAccentFor(HUB_ITEMS.find((item) => item.id === 'meet')!)).toBe('emerald')
    expect(navigationAccentFor({})).toBe('blue')
  })

  it('does not define duplicate ids or arbitrary URLs', () => {
    expect(new Set(HUB_ITEMS.map((item) => item.id)).size).toBe(HUB_ITEMS.length)
    for (const item of HUB_ITEMS.filter(isNavigationRouteItem)) {
      expect(item.href).toMatch(/^\/[a-z0-9/-]+$/)
    }
  })

  it('maps every Hub destination to a real product route or the existing compose action', () => {
    expect(Object.fromEntries(HUB_ITEMS.filter(isNavigationRouteItem).map((item) => [item.id, item.href]))).toEqual({
      lab: '/lab',
      meet: '/meet',
      messages: '/messages',
      notifications: '/notifications',
      feed: '/feed',
      search: '/search',
      saved: '/saved',
      challenges: '/challenges',
      'creator-studio': '/creator-studio',
      wallet: '/wallet',
      gifts: '/gifts',
      vip: '/vip-plus',
      profile: '/profile',
      settings: '/settings',
      help: '/help',
      editor: '/editor',
      admin: '/admin',
    })
    expect(HUB_ITEMS.find((item) => item.id === 'post')).toMatchObject({ kind: 'compose', title: 'Postar' })
    expect(HUB_ITEMS.find((item) => item.id === 'feed')).toMatchObject({ title: 'Casa', href: '/feed' })
  })

  it('keeps coming-soon items unavailable instead of exposing inert navigation', () => {
    expect(isNavigationItemAvailable({
      id: 'future',
      title: 'Futuro',
      description: 'Ainda indisponível.',
      kind: 'coming-soon',
      icon: 'help',
      category: 'tools',
      keywords: [],
      audience: 'authenticated',
    })).toBe(false)
    expect(HUB_ITEMS.every(isNavigationItemAvailable)).toBe(true)
  })

  it('filters admin resources without treating client hiding as authorization', () => {
    expect(filterNavigationItems(access).some((item) => item.id === 'admin')).toBe(false)
    expect(filterNavigationItems({ authenticated: true, isAdmin: true }).some((item) => item.id === 'admin')).toBe(true)
    expect(filterNavigationItems({ authenticated: false, isAdmin: true })).toEqual([])
  })

  it('searches title, description and keywords without case or accents', () => {
    expect(searchNavigationItems('MEET', access).map((item) => item.id)).toContain('meet')
    expect(searchNavigationItems('movimentações', access).map((item) => item.id)).toContain('wallet')
    expect(searchNavigationItems('LABORATORIO', access).map((item) => item.id)).toContain('lab')
    expect(searchNavigationItems('configuracoes', access).map((item) => item.id)).toContain('settings')
    expect(normalizeNavigationSearch('  Notificações  ')).toBe('notificacoes')
  })

  it('never leaks admin results through search', () => {
    expect(searchNavigationItems('admin moderacao', access)).toEqual([])
    expect(searchNavigationItems('admin', { authenticated: true, isAdmin: true }).map((item) => item.id)).toContain('admin')
  })

  it('calculates active routes including deep links and the Feed alias', () => {
    expect(isNavigationItemActive('/', '/feed')).toBe(true)
    expect(isNavigationItemActive('/feed', '/feed')).toBe(true)
    expect(isNavigationItemActive('/messages/abc', '/messages')).toBe(true)
    expect(isNavigationItemActive('/profiled', '/profile')).toBe(false)
  })

  it('records recent and frequent items without storing query or content', () => {
    const storage = new MemoryStorage()
    recordHubUsage('user-a', 'meet', storage)
    recordHubUsage('user-a', 'lab', storage)
    recordHubUsage('user-a', 'meet', storage)
    expect(readHubUsage('user-a', storage)).toEqual({ recent: ['meet', 'lab'], counts: { meet: 2, lab: 1 } })
    expect([...storage.data.values()].join(' ')).not.toMatch(/query|token|secret|message|https?:/i)
  })

  it('keeps usage separated by user', () => {
    const storage = new MemoryStorage()
    recordHubUsage('user-a', 'meet', storage)
    recordHubUsage('user-b', 'lab', storage)
    expect(readHubUsage('user-a', storage).recent).toEqual(['meet'])
    expect(readHubUsage('user-b', storage).recent).toEqual(['lab'])
  })

  it('fails safely when storage is unavailable or malformed', () => {
    expect(readHubUsage('user-a')).toEqual({ recent: [], counts: {} })
    const unavailable = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(recordHubUsage('user-a', 'meet', unavailable)).toEqual({ recent: ['meet'], counts: { meet: 1 } })
    const malformed = { getItem: () => '{bad json' }
    expect(readHubUsage('user-a', malformed)).toEqual({ recent: [], counts: {} })
  })

  it('limits recent history to five controlled item ids', () => {
    const storage = new MemoryStorage()
    for (const id of ['feed', 'messages', 'profile', 'wallet', 'lab', 'meet']) recordHubUsage('user-a', id, storage)
    expect(readHubUsage('user-a', storage).recent).toEqual(['meet', 'lab', 'wallet', 'profile', 'messages'])
  })

  it('exposes accessible Hub and active-item attributes in both surfaces', () => {
    const desktop = readFileSync('app/components/AppSidebar.tsx', 'utf8')
    const mobile = readFileSync('app/components/MobileNavigation.tsx', 'utf8')
    const hub = readFileSync('app/components/EntreUSHub.tsx', 'utf8')
    const wordmark = readFileSync('app/components/EntreUSWordmark.tsx', 'utf8')
    for (const source of [desktop, mobile]) {
      expect(source).toContain('aria-label="Abrir Hub EntreUS"')
      expect(source).toContain('aria-expanded={hubOpen}')
      expect(source).toContain('aria-controls="entreus-hub"')
      expect(source).toContain("aria-current={isNavigationItemActive")
    }
    expect(hub).toContain('role="dialog"')
    expect(hub).toContain("event.key === 'Escape'")
    expect(hub).toContain('createPortal(content, document.body)')
    expect(hub).toContain('data-testid="pinned-apps"')
    expect(hub).toContain('Buscar aplicativos, páginas e recursos')
    expect(hub).toContain('setShowAll(true)')
    expect(hub).toContain('recordHubUsage(userId, item.id, window.localStorage)')
    expect(hub).toContain("item.kind !== 'compose'")
    expect(hub).toContain('isNavigationItemAvailable(item)')
    expect(hub).toContain('handleRouteClick(event, item)')
    expect(hub).toContain('onNavigate={() => closeHubAfterNavigation(item)}')
    expect(hub).toContain('window.setTimeout(closeHub, 180)')
    expect(hub).toContain('router.push(item.href)')
    expect(hub).toContain('router.push(composeHref)')
    expect(hub).toContain('router.prefetch(href)')
    expect(hub).toContain('src="/logo-icon.png"')
    expect(hub).toContain('Só Entre Nós')
    expect(hub).not.toContain('>Hub EntreUS</h2>')
    expect(hub).toContain('repeat(auto-fit,minmax')
    expect(desktop).toContain('top-1/2')
    expect(desktop).toContain('-translate-y-1/2')
    expect(desktop).toContain('bottom-[max(env(safe-area-inset-bottom),16px)]')
    expect(hub).toContain("import EntreUSWordmark from './EntreUSWordmark'")
    expect(hub).toContain('flex w-full flex-col items-center text-center')
    expect(hub).toContain('max-w-44 text-center')
    expect(wordmark).toContain('aria-label="EntreUS"')
    expect(wordmark).toContain('aria-hidden="true"')
    expect(wordmark).toContain('text-blue-600 dark:text-blue-400')
    expect(wordmark).toContain('whitespace-nowrap')
    expect(hub).toContain('navigationAccentFor(item)')
    expect(hub).toContain('motion-reduce:transform-none')
    expect(hub).not.toMatch(/animate-(spin|pulse|bounce)|infinite/)
    const feed = readFileSync('app/feed/page.tsx', 'utf8')
    expect(feed).toContain('data-testid="feed-layout"')
    expect(feed).toContain('xl:grid-cols-[minmax(0,60rem)_clamp(18rem,22vw,24rem)]')
    expect(feed).toContain('max-w-[60rem]')
    expect(feed).toContain('data-testid="feed-right-rail"')
    expect(hub).not.toMatch(/dangerouslySetInnerHTML|eval\s*\(/)
  })

  it('keeps the central Hub trigger calm, stateful and reduced-motion safe', () => {
    const globals = readFileSync('app/globals.css', 'utf8')
    const desktop = readFileSync('app/components/AppSidebar.tsx', 'utf8')
    const mobile = readFileSync('app/components/MobileNavigation.tsx', 'utf8')
    for (const source of [desktop, mobile]) {
      expect(source).toContain('entreus-hub-trigger')
      expect(source).toContain('data-active={hubOpen}')
    }
    expect(globals).toContain('4.6s ease-in-out infinite')
    expect(globals).toContain('translateY(-2px) rotate(1deg) scale(1.02)')
    expect(globals).toContain('.entreus-hub-trigger:active')
    expect(globals).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('coordinates post option menus and preserves accessible menu behavior', () => {
    const menu = readFileSync('app/components/PostMoreMenu.tsx', 'utf8')
    expect(menu).toContain("POST_MORE_MENU_OPEN_EVENT = 'entreus:post-more-menu-open'")
    expect(menu).toContain("document.addEventListener('pointerdown', closeFromOutside)")
    expect(menu).toContain("event.key !== 'Escape'")
    expect(menu).toContain('aria-expanded={open}')
    expect(menu).toContain('aria-haspopup="menu"')
    expect(menu).toContain('role="menu"')
    expect(menu).toContain('role="menuitem"')
    expect(menu).not.toContain('className="fixed inset-0')
  })

  it('provides bounded prefetch and immediate navigation feedback', () => {
    const hub = readFileSync('app/components/EntreUSHub.tsx', 'utf8')
    const progress = readFileSync('app/components/NavigationProgress.tsx', 'utf8')
    const providers = readFileSync('app/providers.tsx', 'utf8')
    const globals = readFileSync('app/globals.css', 'utf8')

    expect(hub).toContain("PRIMARY_PREFETCH_HREFS = ['/messages', '/profile', '/lab', '/meet', '/feed']")
    expect(hub).toContain("SECONDARY_PREFETCH_HREFS = ['/notifications', '/search', '/creator-studio', '/wallet', '/settings']")
    expect(hub).toContain('.slice(0, 5)')
    expect(hub).toContain('router.prefetch(href)')
    expect(hub).toContain("typeof window.requestIdleCallback === 'function'")
    expect(hub).toContain('window.setTimeout(prefetch, 100)')
    expect(hub).toContain('prefetch={false}')
    expect(hub).toContain("setAttribute('data-navigation-pending', 'true')")
    expect(hub).toContain('announceNavigationStart')
    expect(progress).toContain('data-testid="navigation-progress"')
    expect(progress).toContain('12_000')
    expect(providers).toContain('<NavigationProgress />')
    expect(globals).toContain('@keyframes entreus-navigation-progress')
  })

  it('defines lightweight route loading shells for priority destinations', () => {
    const loadingRoutes = {
      'app/lab/loading.tsx': 'EntreUS Lab',
      'app/meet/loading.tsx': 'EntreUS Meet',
      'app/messages/loading.tsx': 'Mensagens',
      'app/profile/loading.tsx': 'Perfil',
      'app/creator-studio/loading.tsx': 'Creator Studio',
    }

    for (const [path, title] of Object.entries(loadingRoutes)) {
      const source = readFileSync(path, 'utf8')
      expect(source).toContain('RouteLoadingShell')
      expect(source).toContain(`title="${title}"`)
    }

    const shell = readFileSync('app/components/RouteLoadingShell.tsx', 'utf8')
    expect(shell).toContain('aria-busy="true"')
    expect(shell).toContain('bg-background')
    expect(shell).toContain('bg-surface')
    expect(shell).not.toContain('animate-spin')
  })

  it('keeps Lab and the Meet landing free from eager heavyweight features', () => {
    const lab = readFileSync('app/lab/page.tsx', 'utf8')
    const meet = readFileSync('app/meet/page.tsx', 'utf8')

    expect(lab).not.toContain("'use client'")
    expect(lab).not.toMatch(/supabase|fetch\(|@livekit|livekit-client|jspdf|pdfjs-dist/)
    expect(meet).not.toMatch(/@livekit|livekit-client|MeetRoomClient/)
    expect(meet).toContain("supabase.auth.getSession()")
    expect(meet).not.toContain('/api/ai/')
  })
})
