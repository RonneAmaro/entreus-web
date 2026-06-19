export type UserTier = 'standard' | 'vip' | 'vip_premium' | 'elder'

export type UserTierEntitlement = {
  vipStatus?: string | null
  vipExpiresAt?: string | null
  badgeSlugs?: readonly string[] | null
}

const VIP_BADGE_SLUGS = new Set(['vip', 'vip-plus', 'vip_plus'])
const VIP_PREMIUM_BADGE_SLUGS = new Set(['vip_premium'])
const ELDER_BADGE_SLUGS = new Set(['elder', 'anciao'])

export function resolveUserTier(
  entitlement: UserTierEntitlement = {},
  now = Date.now(),
): UserTier {
  const badgeSlugs = new Set(
    (entitlement.badgeSlugs || []).map((badgeSlug) => normalizeBadgeSlug(badgeSlug)),
  )

  if (hasAnyBadge(badgeSlugs, ELDER_BADGE_SLUGS)) return 'elder'
  if (hasAnyBadge(badgeSlugs, VIP_PREMIUM_BADGE_SLUGS)) return 'vip_premium'
  if (isActiveVip(entitlement, now) || hasAnyBadge(badgeSlugs, VIP_BADGE_SLUGS)) return 'vip'

  return 'standard'
}

export function isTierBadgeSlug(value: string | null | undefined) {
  const badgeSlug = normalizeBadgeSlug(value || '')

  return (
    ELDER_BADGE_SLUGS.has(badgeSlug) ||
    VIP_PREMIUM_BADGE_SLUGS.has(badgeSlug) ||
    VIP_BADGE_SLUGS.has(badgeSlug)
  )
}

export function getUserTierLabel(tier: UserTier) {
  if (tier === 'elder') return 'Anciao'
  if (tier === 'vip_premium') return 'VIP Premium'
  if (tier === 'vip') return 'VIP'
  return 'Usuario'
}

function isActiveVip(entitlement: UserTierEntitlement, now: number) {
  if (entitlement.vipStatus?.trim().toLowerCase() !== 'active') return false
  if (!entitlement.vipExpiresAt) return false

  const expiresAt = Date.parse(entitlement.vipExpiresAt)
  return Number.isFinite(expiresAt) && expiresAt > now
}

function hasAnyBadge(userBadges: Set<string>, allowedBadges: Set<string>) {
  for (const badgeSlug of allowedBadges) {
    if (userBadges.has(badgeSlug)) return true
  }

  return false
}

function normalizeBadgeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
