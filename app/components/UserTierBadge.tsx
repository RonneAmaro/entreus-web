import { getUserTierLabel, type UserTier } from '@/lib/user-tiers'
import UserBadgeIcon from './UserBadgeIcon'

type UserTierBadgeProps = {
  tier: UserTier
  size?: 'sm' | 'md'
  className?: string
}

const TIER_BADGE_SLUGS = {
  vip: 'vip',
  vip_premium: 'vip_premium',
  elder: 'elder',
} as const

export default function UserTierBadge({
  tier,
  size = 'sm',
  className = '',
}: UserTierBadgeProps) {
  if (tier === 'standard') return null

  const label = getUserTierLabel(tier)

  return (
    <UserBadgeIcon
      badge={{ slug: TIER_BADGE_SLUGS[tier], name: label }}
      size={size}
      title={`Beneficio ${label}`}
      className={className}
    />
  )
}
