'use client'

import { useState } from 'react'
import { Award, Crown, Gem, ShieldCheck, Sparkles } from 'lucide-react'
import {
  resolveBadgeIcon,
  type BadgeIconInput,
  type BadgeIconSlug,
} from '@/lib/badge-icons'

type UserBadgeIconSize = 'sm' | 'md' | 'lg' | 'profile'

type UserBadgeIconProps = {
  badge: BadgeIconInput | string
  size?: UserBadgeIconSize
  className?: string
  title?: string
  decorative?: boolean
}

const SIZE_CLASS_NAMES: Record<UserBadgeIconSize, string> = {
  sm: 'h-6 w-6 text-[9px]',
  md: 'h-7 w-7 text-[10px]',
  lg: 'h-9 w-9 text-xs',
  profile: 'h-16 w-16 text-base',
}

const FALLBACK_ICON_CLASS_NAMES: Record<UserBadgeIconSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  profile: 'h-8 w-8',
}

const FALLBACK_ICONS: Record<BadgeIconSlug, typeof Award> = {
  elder: Crown,
  vip_premium: Gem,
  vip: Sparkles,
  community: ShieldCheck,
  unknown: Award,
}

export default function UserBadgeIcon({
  badge,
  size = 'sm',
  className = '',
  title,
  decorative = false,
}: UserBadgeIconProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const resolvedBadge = resolveBadgeIcon(badge)
  const accessibleLabel = title || resolvedBadge.accessibleLabel
  const imageSrc = imageFailed ? null : resolvedBadge.imageSrc
  const FallbackIcon = FALLBACK_ICONS[resolvedBadge.slug] || Award

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/85 font-black leading-none text-zinc-700 ring-offset-1 ring-offset-white dark:bg-black/60 dark:text-white dark:ring-offset-black ${SIZE_CLASS_NAMES[size]} ${resolvedBadge.ringClassName} ${className}`}
      title={accessibleLabel}
      aria-label={decorative ? undefined : accessibleLabel}
      aria-hidden={decorative ? 'true' : undefined}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={accessibleLabel}
          title={accessibleLabel}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="inline-flex h-full w-full items-center justify-center bg-gradient-to-br from-white via-zinc-100 to-zinc-200 text-current dark:from-zinc-900 dark:via-zinc-950 dark:to-black">
          <FallbackIcon className={FALLBACK_ICON_CLASS_NAMES[size]} aria-hidden="true" />
          <span className="sr-only">{accessibleLabel}</span>
        </span>
      )}
    </span>
  )
}
