import type { UserTier } from '@/lib/user-tiers'

export type ProfileThemeKey =
  | 'default'
  | 'vip-blue'
  | 'vip-neon'
  | 'vip-premium-fuchsia'
  | 'elder-gold'
  | 'elder-royal'

export type ProfileThemeAccess = UserTier

export type ProfileTheme = {
  key: ProfileThemeKey
  name: string
  description: string
  minimumTier: ProfileThemeAccess
  previewClassName: string
  cardClassName: string
  bannerClassName: string
  avatarFrameClassName: string
  accentClassName: string
}

const TIER_RANK: Record<UserTier, number> = {
  standard: 0,
  vip: 1,
  vip_premium: 2,
  elder: 3,
}

export const PROFILE_THEMES: ProfileTheme[] = [
  {
    key: 'default',
    name: 'Padrao EntreUS',
    description: 'Visual limpo para todos os perfis.',
    minimumTier: 'standard',
    previewClassName: 'from-zinc-100 via-white to-zinc-200 dark:from-zinc-900 dark:via-zinc-950 dark:to-black',
    cardClassName: '',
    bannerClassName: '',
    avatarFrameClassName: '',
    accentClassName: 'bg-zinc-950 dark:bg-white',
  },
  {
    key: 'vip-blue',
    name: 'VIP Azul',
    description: 'Azul discreto com destaque de assinante.',
    minimumTier: 'vip',
    previewClassName: 'from-sky-100 via-white to-blue-100 dark:from-sky-950 dark:via-zinc-950 dark:to-blue-950',
    cardClassName: '!border-sky-200/90 !ring-sky-100/80 shadow-sky-500/10 dark:!border-sky-700/70 dark:!ring-sky-950/80',
    bannerClassName: 'from-sky-100 via-blue-100 to-white dark:from-sky-950 dark:via-blue-950 dark:to-zinc-950',
    avatarFrameClassName: '!ring-sky-300/80 shadow-sky-500/20 dark:!ring-sky-700/70',
    accentClassName: 'bg-sky-500',
  },
  {
    key: 'vip-neon',
    name: 'VIP Neon',
    description: 'Moderno, escuro e com brilho controlado.',
    minimumTier: 'vip',
    previewClassName: 'from-cyan-100 via-zinc-950 to-lime-100 dark:from-cyan-950 dark:via-black dark:to-lime-950',
    cardClassName: '!border-cyan-200/80 !ring-lime-200/50 shadow-cyan-500/10 dark:!border-cyan-700/70 dark:!ring-lime-900/60',
    bannerClassName: 'from-cyan-200 via-zinc-900 to-lime-200 dark:from-cyan-950 dark:via-black dark:to-lime-950',
    avatarFrameClassName: '!ring-cyan-300/80 shadow-cyan-500/20 dark:!ring-lime-700/70',
    accentClassName: 'bg-cyan-500',
  },
  {
    key: 'vip-premium-fuchsia',
    name: 'VIP Premium Fuchsia',
    description: 'Destaque premium com acento fuchsia.',
    minimumTier: 'vip_premium',
    previewClassName: 'from-fuchsia-100 via-white to-rose-100 dark:from-fuchsia-950 dark:via-zinc-950 dark:to-rose-950',
    cardClassName: '!border-fuchsia-200/90 !ring-fuchsia-100/80 shadow-fuchsia-500/10 dark:!border-fuchsia-700/70 dark:!ring-fuchsia-950/80',
    bannerClassName: 'from-fuchsia-100 via-rose-100 to-white dark:from-fuchsia-950 dark:via-rose-950 dark:to-zinc-950',
    avatarFrameClassName: '!ring-fuchsia-300/80 shadow-fuchsia-500/20 dark:!ring-fuchsia-700/70',
    accentClassName: 'bg-fuchsia-500',
  },
  {
    key: 'elder-gold',
    name: 'Anciao Ouro',
    description: 'Presenca dourada reservada aos Anciaos.',
    minimumTier: 'elder',
    previewClassName: 'from-amber-100 via-white to-yellow-100 dark:from-amber-950 dark:via-zinc-950 dark:to-yellow-950',
    cardClassName: '!border-amber-300/90 !ring-amber-100/90 shadow-amber-500/10 dark:!border-amber-600/70 dark:!ring-amber-950/80',
    bannerClassName: 'from-amber-100 via-yellow-100 to-white dark:from-amber-950 dark:via-yellow-950 dark:to-zinc-950',
    avatarFrameClassName: '!ring-amber-300/90 shadow-amber-500/25 dark:!ring-amber-600/80',
    accentClassName: 'bg-amber-500',
  },
  {
    key: 'elder-royal',
    name: 'Anciao Royal',
    description: 'Nobre, ambar e reservado para a camada maxima.',
    minimumTier: 'elder',
    previewClassName: 'from-indigo-100 via-amber-50 to-purple-100 dark:from-indigo-950 dark:via-amber-950 dark:to-purple-950',
    cardClassName: '!border-amber-300/90 !ring-indigo-100/90 shadow-indigo-500/10 dark:!border-amber-600/70 dark:!ring-indigo-950/80',
    bannerClassName: 'from-indigo-100 via-amber-100 to-purple-100 dark:from-indigo-950 dark:via-amber-950 dark:to-purple-950',
    avatarFrameClassName: '!ring-amber-300/90 shadow-indigo-500/20 dark:!ring-amber-600/80',
    accentClassName: 'bg-indigo-600',
  },
]

const PROFILE_THEME_KEYS = new Set(PROFILE_THEMES.map((theme) => theme.key))

export function isProfileThemeKey(value: unknown): value is ProfileThemeKey {
  return typeof value === 'string' && PROFILE_THEME_KEYS.has(value as ProfileThemeKey)
}

export function getProfileTheme(themeKey: string | null | undefined) {
  return PROFILE_THEMES.find((theme) => theme.key === themeKey) || PROFILE_THEMES[0]
}

export function canUseProfileTheme(tier: UserTier, themeKey: string | null | undefined) {
  const theme = getProfileTheme(themeKey)

  return TIER_RANK[tier] >= TIER_RANK[theme.minimumTier]
}

export function getEffectiveProfileThemeKey(
  themeKey: string | null | undefined,
  tier: UserTier,
): ProfileThemeKey {
  if (!isProfileThemeKey(themeKey)) return 'default'
  if (!canUseProfileTheme(tier, themeKey)) return 'default'

  return themeKey
}

export function getProfileThemeAccessLabel(theme: ProfileTheme) {
  if (theme.minimumTier === 'elder') return 'Exclusivo Anciao'
  if (theme.minimumTier === 'vip_premium') return 'Disponivel para VIP Premium'
  if (theme.minimumTier === 'vip') return 'Disponivel para VIP'
  return 'Disponivel para todos'
}
