import type { ReactNode } from 'react'
import type { UserTier } from '@/lib/user-tiers'

type UserTierFrameProps = {
  tier: UserTier
  children: ReactNode
  className?: string
}

export function getUserTierSurfaceClassName(tier: UserTier, surface: 'post' | 'profile' = 'post') {
  if (tier === 'elder') {
    return surface === 'profile'
      ? '!border-amber-300/90 !ring-amber-200/80 shadow-amber-500/10 dark:!border-amber-500/60 dark:!ring-amber-900/80'
      : '!border-amber-300/90 !ring-amber-200/80 !shadow-md shadow-amber-500/10 dark:!border-amber-500/60 dark:!ring-amber-900/80'
  }

  if (tier === 'vip_premium') {
    return surface === 'profile'
      ? '!border-fuchsia-300/90 !ring-fuchsia-200/80 shadow-fuchsia-500/10 dark:!border-fuchsia-500/60 dark:!ring-fuchsia-900/80'
      : '!border-fuchsia-300/90 !ring-fuchsia-200/80 !shadow-md shadow-fuchsia-500/10 dark:!border-fuchsia-500/60 dark:!ring-fuchsia-900/80'
  }

  if (tier === 'vip') {
    return surface === 'profile'
      ? '!border-sky-300/90 !ring-sky-200/80 shadow-sky-500/10 dark:!border-sky-500/60 dark:!ring-sky-900/80'
      : '!border-sky-300/90 !ring-sky-200/80 !shadow-md shadow-sky-500/10 dark:!border-sky-500/60 dark:!ring-sky-900/80'
  }

  return ''
}

export default function UserTierFrame({
  tier,
  children,
  className = '',
}: UserTierFrameProps) {
  const frameClassName = getUserTierSurfaceClassName(tier)

  return (
    <div className={`inline-flex shrink-0 rounded-full ${frameClassName} ${className}`}>
      {children}
    </div>
  )
}
