'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isTierBadgeSlug } from '@/lib/user-tiers'
import UserBadgeStack from './UserBadgeStack'

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

      setBadges(normalizedBadges)
    }

    loadBadges()
  }, [userId, max, excludeTierBadges])

  if (badges.length === 0) return null

  return <UserBadgeStack badges={badges} size={size} max={max} />
}
