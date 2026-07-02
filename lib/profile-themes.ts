import type { UserTier } from '@/lib/user-tiers'

export type ProfileThemeKey =
  | 'default'
  | 'vip-blue'
  | 'vip-neon'
  | 'vip-premium-fuchsia'
  | 'elder-gold'
  | 'elder-royal'
  | 'team-brazil'
  | 'team-argentina'
  | 'team-france'
  | 'team-portugal'
  | 'team-germany'
  | 'team-congo'
  | 'team-japan'
  | 'team-usa'

export type ProfileThemeAccess = UserTier
export type ProfileThemeCategory = 'base' | 'team' | 'vip' | 'elder'

export type ProfileTheme = {
  key: ProfileThemeKey
  name: string
  description: string
  category: ProfileThemeCategory
  minimumTier: ProfileThemeAccess
  previewClassName: string
  cardClassName: string
  postAccentClassName: string
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
    category: 'base',
    minimumTier: 'standard',
    previewClassName: 'from-zinc-100 via-white to-zinc-200 dark:from-zinc-900 dark:via-zinc-950 dark:to-black',
    cardClassName: '',
    postAccentClassName: '',
    bannerClassName: '',
    avatarFrameClassName: '',
    accentClassName: 'bg-zinc-950 dark:bg-white',
  },
  {
    key: 'team-brazil',
    name: 'Torcida Brasil',
    description: 'Verde, amarelo e azul para apoiar a selecao.',
    category: 'team',
    minimumTier: 'standard',
    previewClassName: 'from-green-200 via-yellow-100 to-sky-200 dark:from-green-950 dark:via-yellow-950 dark:to-sky-950',
    cardClassName: '!border-green-200/90 !ring-yellow-100/80 shadow-green-500/10 dark:!border-green-700/70 dark:!ring-yellow-950/70',
    postAccentClassName: 'from-green-500 via-yellow-400 to-sky-500',
    bannerClassName: 'from-green-200 via-yellow-100 to-sky-200 dark:from-green-950 dark:via-yellow-950 dark:to-sky-950',
    avatarFrameClassName: '!ring-green-400/85 shadow-yellow-500/25 dark:!ring-yellow-500/80',
    accentClassName: 'bg-green-500',
  },
  {
    key: 'team-argentina',
    name: 'Torcida Argentina',
    description: 'Azul claro e branco com presenca leve.',
    category: 'team',
    minimumTier: 'standard',
    previewClassName: 'from-sky-100 via-white to-sky-200 dark:from-sky-950 dark:via-zinc-950 dark:to-sky-900',
    cardClassName: '!border-sky-200/90 !ring-sky-100/80 shadow-sky-500/10 dark:!border-sky-700/70 dark:!ring-sky-950/75',
    postAccentClassName: 'from-sky-400 via-white to-sky-500',
    bannerClassName: 'from-sky-100 via-white to-sky-200 dark:from-sky-950 dark:via-zinc-950 dark:to-sky-900',
    avatarFrameClassName: '!ring-sky-300/85 shadow-sky-500/20 dark:!ring-sky-600/80',
    accentClassName: 'bg-sky-400',
  },
  {
    key: 'team-france',
    name: 'Torcida Franca',
    description: 'Azul, branco e vermelho em detalhe elegante.',
    category: 'team',
    minimumTier: 'standard',
    previewClassName: 'from-blue-200 via-white to-red-200 dark:from-blue-950 dark:via-zinc-950 dark:to-red-950',
    cardClassName: '!border-blue-200/90 !ring-red-100/70 shadow-blue-500/10 dark:!border-blue-700/70 dark:!ring-red-950/70',
    postAccentClassName: 'from-blue-600 via-white to-red-500',
    bannerClassName: 'from-blue-200 via-white to-red-200 dark:from-blue-950 dark:via-zinc-950 dark:to-red-950',
    avatarFrameClassName: '!ring-blue-400/85 shadow-red-500/20 dark:!ring-blue-600/80',
    accentClassName: 'bg-blue-600',
  },
  {
    key: 'team-portugal',
    name: 'Torcida Portugal',
    description: 'Verde e vermelho com contraste forte.',
    category: 'team',
    minimumTier: 'standard',
    previewClassName: 'from-green-200 via-red-100 to-red-200 dark:from-green-950 dark:via-red-950 dark:to-zinc-950',
    cardClassName: '!border-red-200/90 !ring-green-100/70 shadow-red-500/10 dark:!border-red-700/70 dark:!ring-green-950/70',
    postAccentClassName: 'from-green-600 via-red-500 to-red-700',
    bannerClassName: 'from-green-200 via-red-100 to-red-200 dark:from-green-950 dark:via-red-950 dark:to-zinc-950',
    avatarFrameClassName: '!ring-red-400/85 shadow-green-500/20 dark:!ring-red-600/80',
    accentClassName: 'bg-red-600',
  },
  {
    key: 'team-germany',
    name: 'Torcida Alemanha',
    description: 'Preto, vermelho e amarelo para posts de torcida.',
    category: 'team',
    minimumTier: 'standard',
    previewClassName: 'from-zinc-900 via-red-500 to-yellow-300 dark:from-black dark:via-red-950 dark:to-yellow-950',
    cardClassName: '!border-yellow-200/90 !ring-red-100/75 shadow-yellow-500/10 dark:!border-yellow-700/70 dark:!ring-red-950/75',
    postAccentClassName: 'from-zinc-950 via-red-600 to-yellow-400',
    bannerClassName: 'from-zinc-900 via-red-500 to-yellow-300 dark:from-black dark:via-red-950 dark:to-yellow-950',
    avatarFrameClassName: '!ring-yellow-400/85 shadow-red-500/20 dark:!ring-yellow-600/80',
    accentClassName: 'bg-yellow-400',
  },
  {
    key: 'team-congo',
    name: 'Torcida Congo',
    description: 'Azul, amarelo e vermelho inspirados na RDC.',
    category: 'team',
    minimumTier: 'standard',
    previewClassName: 'from-sky-300 via-yellow-200 to-red-200 dark:from-sky-950 dark:via-yellow-950 dark:to-red-950',
    cardClassName: '!border-sky-200/90 !ring-yellow-100/80 shadow-sky-500/10 dark:!border-sky-700/70 dark:!ring-yellow-950/75',
    postAccentClassName: 'from-sky-500 via-yellow-400 to-red-500',
    bannerClassName: 'from-sky-300 via-yellow-200 to-red-200 dark:from-sky-950 dark:via-yellow-950 dark:to-red-950',
    avatarFrameClassName: '!ring-sky-400/85 shadow-yellow-500/20 dark:!ring-sky-600/80',
    accentClassName: 'bg-sky-500',
  },
  {
    key: 'team-japan',
    name: 'Torcida Japao',
    description: 'Branco e vermelho com visual limpo.',
    category: 'team',
    minimumTier: 'standard',
    previewClassName: 'from-white via-red-100 to-white dark:from-zinc-950 dark:via-red-950 dark:to-zinc-900',
    cardClassName: '!border-red-200/90 !ring-red-100/80 shadow-red-500/10 dark:!border-red-700/70 dark:!ring-red-950/75',
    postAccentClassName: 'from-white via-red-500 to-white',
    bannerClassName: 'from-white via-red-100 to-white dark:from-zinc-950 dark:via-red-950 dark:to-zinc-900',
    avatarFrameClassName: '!ring-red-400/85 shadow-red-500/20 dark:!ring-red-600/80',
    accentClassName: 'bg-red-500',
  },
  {
    key: 'team-usa',
    name: 'Torcida USA',
    description: 'Azul, branco e vermelho com energia esportiva.',
    category: 'team',
    minimumTier: 'standard',
    previewClassName: 'from-blue-200 via-white to-red-200 dark:from-blue-950 dark:via-zinc-950 dark:to-red-950',
    cardClassName: '!border-blue-200/90 !ring-red-100/70 shadow-blue-500/10 dark:!border-blue-700/70 dark:!ring-red-950/70',
    postAccentClassName: 'from-blue-700 via-white to-red-600',
    bannerClassName: 'from-blue-200 via-white to-red-200 dark:from-blue-950 dark:via-zinc-950 dark:to-red-950',
    avatarFrameClassName: '!ring-blue-500/85 shadow-red-500/20 dark:!ring-blue-600/80',
    accentClassName: 'bg-blue-700',
  },
  {
    key: 'vip-blue',
    name: 'VIP Azul',
    description: 'Azul discreto com destaque de assinante.',
    category: 'vip',
    minimumTier: 'vip',
    previewClassName: 'from-sky-100 via-white to-blue-100 dark:from-sky-950 dark:via-zinc-950 dark:to-blue-950',
    cardClassName: '!border-sky-200/90 !ring-sky-100/80 shadow-sky-500/10 dark:!border-sky-700/70 dark:!ring-sky-950/80',
    postAccentClassName: 'from-sky-500 via-blue-500 to-cyan-400',
    bannerClassName: 'from-sky-100 via-blue-100 to-white dark:from-sky-950 dark:via-blue-950 dark:to-zinc-950',
    avatarFrameClassName: '!ring-sky-300/80 shadow-sky-500/20 dark:!ring-sky-700/70',
    accentClassName: 'bg-sky-500',
  },
  {
    key: 'vip-neon',
    name: 'VIP Neon',
    description: 'Moderno, escuro e com brilho controlado.',
    category: 'vip',
    minimumTier: 'vip',
    previewClassName: 'from-cyan-100 via-zinc-950 to-lime-100 dark:from-cyan-950 dark:via-black dark:to-lime-950',
    cardClassName: '!border-cyan-200/80 !ring-lime-200/50 shadow-cyan-500/10 dark:!border-cyan-700/70 dark:!ring-lime-900/60',
    postAccentClassName: 'from-cyan-400 via-zinc-950 to-lime-400',
    bannerClassName: 'from-cyan-200 via-zinc-900 to-lime-200 dark:from-cyan-950 dark:via-black dark:to-lime-950',
    avatarFrameClassName: '!ring-cyan-300/80 shadow-cyan-500/20 dark:!ring-lime-700/70',
    accentClassName: 'bg-cyan-500',
  },
  {
    key: 'vip-premium-fuchsia',
    name: 'VIP Premium Fuchsia',
    description: 'Destaque premium com acento fuchsia.',
    category: 'vip',
    minimumTier: 'vip_premium',
    previewClassName: 'from-fuchsia-100 via-white to-rose-100 dark:from-fuchsia-950 dark:via-zinc-950 dark:to-rose-950',
    cardClassName: '!border-fuchsia-200/90 !ring-fuchsia-100/80 shadow-fuchsia-500/10 dark:!border-fuchsia-700/70 dark:!ring-fuchsia-950/80',
    postAccentClassName: 'from-fuchsia-500 via-rose-500 to-pink-400',
    bannerClassName: 'from-fuchsia-100 via-rose-100 to-white dark:from-fuchsia-950 dark:via-rose-950 dark:to-zinc-950',
    avatarFrameClassName: '!ring-fuchsia-300/80 shadow-fuchsia-500/20 dark:!ring-fuchsia-700/70',
    accentClassName: 'bg-fuchsia-500',
  },
  {
    key: 'elder-gold',
    name: 'Anciao Ouro',
    description: 'Presenca dourada reservada aos Anciaos.',
    category: 'elder',
    minimumTier: 'elder',
    previewClassName: 'from-amber-100 via-white to-yellow-100 dark:from-amber-950 dark:via-zinc-950 dark:to-yellow-950',
    cardClassName: '!border-amber-300/90 !ring-amber-100/90 shadow-amber-500/10 dark:!border-amber-600/70 dark:!ring-amber-950/80',
    postAccentClassName: 'from-amber-500 via-yellow-300 to-orange-400',
    bannerClassName: 'from-amber-100 via-yellow-100 to-white dark:from-amber-950 dark:via-yellow-950 dark:to-zinc-950',
    avatarFrameClassName: '!ring-amber-300/90 shadow-amber-500/25 dark:!ring-amber-600/80',
    accentClassName: 'bg-amber-500',
  },
  {
    key: 'elder-royal',
    name: 'Anciao Royal',
    description: 'Nobre, ambar e reservado para a camada maxima.',
    category: 'elder',
    minimumTier: 'elder',
    previewClassName: 'from-indigo-100 via-amber-50 to-purple-100 dark:from-indigo-950 dark:via-amber-950 dark:to-purple-950',
    cardClassName: '!border-amber-300/90 !ring-indigo-100/90 shadow-indigo-500/10 dark:!border-amber-600/70 dark:!ring-indigo-950/80',
    postAccentClassName: 'from-indigo-600 via-amber-300 to-purple-600',
    bannerClassName: 'from-indigo-100 via-amber-100 to-purple-100 dark:from-indigo-950 dark:via-amber-950 dark:to-purple-950',
    avatarFrameClassName: '!ring-amber-300/90 shadow-indigo-500/20 dark:!ring-amber-600/80',
    accentClassName: 'bg-indigo-600',
  },
]

export const PROFILE_THEME_GROUPS: Array<{
  category: ProfileThemeCategory
  title: string
  description: string
}> = [
  {
    category: 'base',
    title: 'Visual base',
    description: 'Tema padrao para manter o perfil limpo.',
  },
  {
    category: 'team',
    title: 'Cores de torcida',
    description: 'Cores livres para apoiar sua selecao nos posts.',
  },
  {
    category: 'vip',
    title: 'VIP e VIP Premium',
    description: 'Destaques mais fortes para assinantes.',
  },
  {
    category: 'elder',
    title: 'Anciao',
    description: 'Temas nobres para reconhecimento especial.',
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

export function getEffectiveProfileTheme(
  themeKey: string | null | undefined,
  tier: UserTier,
) {
  return getProfileTheme(getEffectiveProfileThemeKey(themeKey, tier))
}

export function isTeamProfileTheme(themeKey: string | null | undefined) {
  return getProfileTheme(themeKey).category === 'team'
}

export function getProfileThemeAccessLabel(theme: ProfileTheme) {
  if (theme.minimumTier === 'elder') return 'Exclusivo Anciao'
  if (theme.minimumTier === 'vip_premium') return 'Disponivel para VIP Premium'
  if (theme.minimumTier === 'vip') return 'Disponivel para VIP'
  return 'Disponivel para todos'
}
