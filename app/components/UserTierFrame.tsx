import type { ReactNode } from 'react'
import { getProfileVisualSurfaceClassName } from '@/lib/profile-visuals'
import type { UserTier } from '@/lib/user-tiers'

type UserTierFrameProps = {
  tier: UserTier
  children: ReactNode
  className?: string
}

export function getUserTierSurfaceClassName(tier: UserTier, surface: 'post' | 'profile' = 'post') {
  return getProfileVisualSurfaceClassName({ tier }, surface)
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
