import type { ReactNode } from 'react'
import { getEffectiveProfileTheme } from '@/lib/profile-themes'
import type { UserTier } from '@/lib/user-tiers'
import UserTierFrame from './UserTierFrame'

type ProfileAvatarFrameProps = {
  tier: UserTier
  themeKey?: string | null
  avatarUrl?: string | null
  name?: string | null
  username?: string | null
  children?: ReactNode
  className?: string
  imageClassName?: string
  fallbackClassName?: string
}

function getInitial(name?: string | null, username?: string | null) {
  const label = (name || username || 'Usuario').trim()

  return label.slice(0, 1).toUpperCase() || 'U'
}

export default function ProfileAvatarFrame({
  tier,
  themeKey,
  avatarUrl,
  name,
  username,
  children,
  className = '',
  imageClassName = '',
  fallbackClassName = '',
}: ProfileAvatarFrameProps) {
  const theme = getEffectiveProfileTheme(themeKey, tier)
  const label = (name || username || 'Usuario').trim() || 'Usuario'

  return (
    <UserTierFrame
      tier={tier}
      className={`relative h-12 w-12 overflow-visible p-0.5 ring-2 ring-zinc-200 ring-offset-2 ring-offset-white shadow-sm dark:ring-zinc-700 dark:ring-offset-slate-950 ${theme.avatarFrameClassName} ${className}`}
    >
      {children || (avatarUrl ? (
        <img
          src={avatarUrl}
          alt={label}
          className={`h-full w-full rounded-full border border-white/80 object-cover dark:border-black/60 ${imageClassName}`}
        />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center rounded-full border border-white/80 bg-zinc-100 text-sm font-semibold text-zinc-700 dark:border-black/60 dark:bg-zinc-800 dark:text-zinc-300 ${fallbackClassName}`}
        >
          {getInitial(name, username)}
        </span>
      ))}
    </UserTierFrame>
  )
}
