import { Crown, Gem, ShieldCheck } from 'lucide-react'
import { getUserTierLabel, type UserTier } from '@/lib/user-tiers'

type UserTierBadgeProps = {
  tier: UserTier
  size?: 'sm' | 'md'
  className?: string
}

const TIER_STYLES = {
  vip: {
    icon: ShieldCheck,
    className: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/80 dark:bg-sky-950/40 dark:text-sky-100',
  },
  vip_premium: {
    icon: Gem,
    className: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-800/80 dark:bg-fuchsia-950/40 dark:text-fuchsia-100',
  },
  elder: {
    icon: Crown,
    className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100',
  },
} as const

export default function UserTierBadge({
  tier,
  size = 'sm',
  className = '',
}: UserTierBadgeProps) {
  if (tier === 'standard') return null

  const config = TIER_STYLES[tier]
  const Icon = config.icon
  const label = getUserTierLabel(tier)
  const sizeClassName = size === 'md'
    ? 'h-7 gap-1.5 px-2.5 text-xs'
    : 'h-6 gap-1 px-2 text-[11px]'

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border font-black leading-none ${sizeClassName} ${config.className} ${className}`}
      title={`Beneficio ${label}`}
      aria-label={`Beneficio ${label}`}
    >
      <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden="true" />
      {label}
    </span>
  )
}
