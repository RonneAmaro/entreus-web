export const NAVIGATION_START_EVENT = 'entreus:navigation-start'

export type NavigationStartDetail = {
  href: `/${string}`
  title: string
}

export function announceNavigationStart(detail: NavigationStartDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<NavigationStartDetail>(NAVIGATION_START_EVENT, { detail }))
}
