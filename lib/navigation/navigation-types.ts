export type NavigationAudience = 'authenticated' | 'admin'
export type NavigationAccent = 'amber' | 'blue' | 'cyan' | 'emerald' | 'fuchsia' | 'indigo' | 'red' | 'violet'

export type NavigationCategory =
  | 'highlights'
  | 'communication'
  | 'content'
  | 'creator'
  | 'account'
  | 'tools'
  | 'administration'

export type NavigationIcon =
  | 'admin'
  | 'bell'
  | 'bookmark'
  | 'challenge'
  | 'creator'
  | 'editor'
  | 'feed'
  | 'gift'
  | 'help'
  | 'lab'
  | 'meet'
  | 'messages'
  | 'post'
  | 'profile'
  | 'search'
  | 'settings'
  | 'vip'
  | 'wallet'

type NavigationItemBase = {
  id: string
  title: string
  description: string
  icon: NavigationIcon
  category: NavigationCategory
  keywords: readonly string[]
  audience: NavigationAudience
  highlighted?: boolean
  accent?: NavigationAccent
}

export type NavigationRouteItem = NavigationItemBase & {
  kind?: 'route'
  href: `/${string}`
}

export type NavigationComposeItem = NavigationItemBase & {
  kind: 'compose'
  href?: never
}

export type NavigationComingSoonItem = NavigationItemBase & {
  kind: 'coming-soon'
  href?: never
}

export type NavigationItem =
  | NavigationRouteItem
  | NavigationComposeItem
  | NavigationComingSoonItem

export type NavigationAccess = {
  authenticated: boolean
  isAdmin: boolean
}
