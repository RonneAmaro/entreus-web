'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
}

export default function UserBadges({
  userId,
  size = 'sm',
  max = 3,
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
        .slice(0, max)

      setBadges(normalizedBadges)
    }

    loadBadges()
  }, [userId, max])

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
            className={`${imageSize} shrink-0 object-contain align-middle`}
          />
        )
      })}
    </span>
  )
}