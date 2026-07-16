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
  | 'profile'
  | 'search'
  | 'settings'
  | 'vip'
  | 'wallet'

export type NavigationItem = {
  id: string
  title: string
  description: string
  href: `/${string}`
  icon: NavigationIcon
  category: NavigationCategory
  keywords: readonly string[]
  audience: NavigationAudience
  highlighted?: boolean
  accent?: NavigationAccent
}

export type NavigationAccess = {
  authenticated: boolean
  isAdmin: boolean
}
