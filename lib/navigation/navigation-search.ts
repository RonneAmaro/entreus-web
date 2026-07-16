import { HUB_ITEMS } from './navigation-items'
import type { NavigationAccess, NavigationItem } from './navigation-types'

export function normalizeNavigationSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}

export function filterNavigationItems(
  access: NavigationAccess,
  items: readonly NavigationItem[] = HUB_ITEMS,
) {
  if (!access.authenticated) return []
  return items.filter((item) => item.audience !== 'admin' || access.isAdmin)
}

export function searchNavigationItems(
  query: string,
  access: NavigationAccess,
  items: readonly NavigationItem[] = HUB_ITEMS,
) {
  const allowed = filterNavigationItems(access, items)
  const normalizedQuery = normalizeNavigationSearch(query)
  if (!normalizedQuery) return allowed

  return allowed.filter((item) => normalizeNavigationSearch([
    item.title,
    item.description,
    ...item.keywords,
  ].join(' ')).includes(normalizedQuery))
}

export function isNavigationItemActive(pathname: string, href: string) {
  if (href === '/feed') return pathname === '/' || pathname === '/feed'
  return pathname === href || pathname.startsWith(`${href}/`)
}
