'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isTierBadgeSlug } from '@/lib/user-tiers'

type Badge = {
  id: string
  slug: string
  name: string
  title: string | null
  icon: string | null
  color: string
  rarity: string
}

type UserBadgeRow = {
  badges: Badge | Badge[] | null
}

type UserBadgesProps = {
  userId: string
  size?: 'sm' | 'md'
  max?: number
  excludeTierBadges?: boolean
}

function getBadgeRingClass(slug: string) {
  if (slug === 'elder') return 'rounded-full ring-2 ring-amber-300/70 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]'
  if (slug === 'vip_premium') return 'rounded-full ring-2 ring-fuchsia-300/70 drop-shadow-[0_0_8px_rgba(217,70,239,0.35)]'
  if (slug === 'vip') return 'rounded-full ring-2 ring-blue-300/70 drop-shadow-[0_0_8px_rgba(59,130,246,0.35)]'
  if (slug === 'community') return 'rounded-full ring-2 ring-cyan-300/70 drop-shadow-[0_0_8px_rgba(34,211,238,0.32)]'
  return 'rounded-full ring-1 ring-zinc-300/70 dark:ring-zinc-700'
}

export default function UserBadges({
  userId,
  size = 'sm',
  max = 3,
  excludeTierBadges = false,
}: UserBadgesProps) {
  const [badges, setBadges] = useState<Badge[]>([])

  useEffect(() => {
    async function loadBadges() {
      if (!userId) return

      const { data, error } = await supabase
        .from('user_badges')
        .select(`
          badges (
            id,
            slug,
            name,
            title,
            icon,
            color,
            rarity
          )
        `)
        .eq('user_id', userId)
        .order('awarded_at', { ascending: true })

      if (error) {
        console.error('Erro ao carregar selos:', error.message)
        return
      }

      const normalizedBadges = ((data || []) as UserBadgeRow[])
        .map((row) => {
          if (Array.isArray(row.badges)) {
            return row.badges[0] || null
          }

          return row.badges
        })
        .filter((badge): badge is Badge => !!badge)
        .filter((badge) => !excludeTierBadges || !isTierBadgeSlug(badge.slug))
        .slice(0, max)

      setBadges(normalizedBadges)
    }

    loadBadges()
  }, [userId, max, excludeTierBadges])

  if (badges.length === 0) return null

  const imageSize = size === 'md' ? 'h-7 w-7' : 'h-6 w-6'

  return (
    <span className="inline-flex shrink-0 items-center gap-1 align-middle">
      {badges.map((badge) => {
        const title = badge.title
          ? `Selo ${badge.name} — ${badge.title}`
          : `Selo ${badge.name}`

        return (
          <img
            key={badge.id}
            src={badge.icon || `/badges/${badge.slug}.png`}
            alt={title}
            title={title}
            className={`${imageSize} ${getBadgeRingClass(badge.slug)} shrink-0 bg-white/80 object-contain align-middle dark:bg-black/50`}
          />
        )
      })}
    </span>
  )
}
