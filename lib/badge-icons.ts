export type BadgeIconSlug = 'elder' | 'vip_premium' | 'vip' | 'community' | 'unknown'

export type BadgeIconInput = {
  id?: string | null
  slug?: string | null
  name?: string | null
  title?: string | null
  icon?: string | null
}

export type BadgeIconConfig = {
  slug: BadgeIconSlug
  label: string
  imageSrc: string | null
  fallbackText: string
  ringClassName: string
}

export type ResolvedBadgeIcon = BadgeIconConfig & {
  inputSlug: string
  displayName: string
  accessibleLabel: string
}

export const BADGE_ICON_HIERARCHY: BadgeIconSlug[] = [
  'elder',
  'vip_premium',
  'vip',
  'community',
]

const BADGE_ICON_CONFIGS: Record<BadgeIconSlug, BadgeIconConfig> = {
  elder: {
    slug: 'elder',
    label: 'Anciao',
    imageSrc: '/badges/anciao.png',
    fallbackText: 'AN',
    ringClassName: 'ring-2 ring-amber-300/70 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]',
  },
  vip_premium: {
    slug: 'vip_premium',
    label: 'VIP Premium',
    imageSrc: '/badges/vip-premium.png',
    fallbackText: 'VP',
    ringClassName: 'ring-2 ring-fuchsia-300/70 drop-shadow-[0_0_8px_rgba(217,70,239,0.35)]',
  },
  vip: {
    slug: 'vip',
    label: 'VIP',
    imageSrc: null,
    fallbackText: 'VIP',
    ringClassName: 'ring-2 ring-blue-300/70 drop-shadow-[0_0_8px_rgba(59,130,246,0.35)]',
  },
  community: {
    slug: 'community',
    label: 'Comunidade',
    imageSrc: '/badges/comunidade.png',
    fallbackText: 'CO',
    ringClassName: 'ring-2 ring-cyan-300/70 drop-shadow-[0_0_8px_rgba(34,211,238,0.32)]',
  },
  unknown: {
    slug: 'unknown',
    label: 'Selo',
    imageSrc: null,
    fallbackText: 'SE',
    ringClassName: 'ring-1 ring-zinc-300/70 dark:ring-zinc-700',
  },
}

const BADGE_ICON_ALIASES: Record<string, BadgeIconSlug> = {
  elder: 'elder',
  anciao: 'elder',
  vip_premium: 'vip_premium',
  'vip-premium': 'vip_premium',
  vippremium: 'vip_premium',
  vip: 'vip',
  'vip-plus': 'vip',
  vip_plus: 'vip',
  vipplus: 'vip',
  community: 'community',
  comunidade: 'community',
}

const BADGE_ICON_RANK = BADGE_ICON_HIERARCHY.reduce<Record<string, number>>((acc, slug, index) => {
  acc[slug] = index
  return acc
}, {})

export function normalizeBadgeIconSlug(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
}

export function getBadgeIconConfig(value: string | null | undefined): BadgeIconConfig {
  const normalizedSlug = normalizeBadgeIconSlug(value)
  const canonicalSlug = BADGE_ICON_ALIASES[normalizedSlug] || 'unknown'

  return BADGE_ICON_CONFIGS[canonicalSlug]
}

export function resolveBadgeIcon(badge: BadgeIconInput | string): ResolvedBadgeIcon {
  const badgeInput = typeof badge === 'string' ? { slug: badge } : badge
  const inputSlug = normalizeBadgeIconSlug(badgeInput.slug || badgeInput.name || '')
  const config = getBadgeIconConfig(inputSlug)
  const displayName = badgeInput.name?.trim() || config.label
  const badgeTitle = badgeInput.title?.trim()
  const accessibleLabel = badgeTitle
    ? `Selo ${displayName} - ${badgeTitle}`
    : `Selo ${displayName}`

  return {
    ...config,
    inputSlug,
    displayName,
    accessibleLabel,
    imageSrc: badgeInput.icon?.trim() || config.imageSrc,
  }
}

export function getBadgeIconRank(badge: BadgeIconInput | string) {
  const resolved = resolveBadgeIcon(badge)

  return BADGE_ICON_RANK[resolved.slug] ?? BADGE_ICON_HIERARCHY.length
}

export function sortBadgeIconInputs<T extends BadgeIconInput | string>(badges: readonly T[]): T[] {
  return badges
    .map((badge, index) => ({ badge, index, rank: getBadgeIconRank(badge) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((item) => item.badge)
}

export function getVisibleBadgeIcons<T extends BadgeIconInput | string>(badges: readonly T[], max = 3): T[] {
  if (max <= 0) return []

  return sortBadgeIconInputs(badges).slice(0, max)
}

export function getBadgeStackLabel(badges: readonly (BadgeIconInput | string)[]) {
  const labels = badges.map((badge) => resolveBadgeIcon(badge).displayName)

  if (labels.length === 0) return 'Selos'

  return `Selos: ${labels.join(', ')}`
}
