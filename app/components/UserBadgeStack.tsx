import UserBadgeIcon from './UserBadgeIcon'
import {
  getBadgeStackLabel,
  getVisibleBadgeIcons,
  type BadgeIconInput,
} from '@/lib/badge-icons'

type UserBadgeStackProps = {
  badges: readonly BadgeIconInput[]
  size?: 'sm' | 'md'
  max?: number
  className?: string
}

function getBadgeKey(badge: BadgeIconInput, index: number) {
  return badge.id || badge.slug || badge.name || `badge-${index}`
}

export default function UserBadgeStack({
  badges,
  size = 'sm',
  max = 3,
  className = '',
}: UserBadgeStackProps) {
  const visibleBadges = getVisibleBadgeIcons(badges, max)

  if (visibleBadges.length === 0) return null

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 align-middle ${className}`}
      title={getBadgeStackLabel(visibleBadges)}
      aria-label={getBadgeStackLabel(visibleBadges)}
    >
      {visibleBadges.map((badge, index) => (
        <UserBadgeIcon
          key={getBadgeKey(badge, index)}
          badge={badge}
          size={size}
          decorative
        />
      ))}
    </span>
  )
}
