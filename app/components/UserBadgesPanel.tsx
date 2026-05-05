'use client'

import { useEffect, useState } from 'react'
import { Award, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Badge = {
  id: string
  slug: string
  name: string
  title: string | null
  icon: string | null
  color: string | null
  rarity: string | null
}

type UserBadgeRow = {
  awarded_at: string | null
  badges: Badge | Badge[] | null
}

type UserBadgesPanelProps = {
  userId: string
  title?: string
  emptyMessage?: string
}

export default function UserBadgesPanel({
  userId,
  title = 'Selos conquistados',
  emptyMessage = 'Este usuário ainda não possui selos conquistados.',
}: UserBadgesPanelProps) {
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadBadges() {
      if (!userId) {
        setBadges([])
        setLoading(false)
        return
      }

      setLoading(true)

      const { data, error } = await supabase
        .from('user_badges')
        .select(`
          awarded_at,
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
        console.error('Erro ao carregar painel de selos:', error.message)
        setBadges([])
        setLoading(false)
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

      setBadges(normalizedBadges)
      setLoading(false)
    }

    loadBadges()
  }, [userId])

  function getBadgeTitle(badge: Badge) {
    if (badge.title) {
      return `${badge.name} — ${badge.title}`
    }

    return badge.name
  }

  function getBadgeDescription(badge: Badge) {
    if (badge.title) {
      return `Selo ${badge.name} — ${badge.title}`
    }

    return `Selo ${badge.name}`
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-50 text-yellow-600 dark:bg-yellow-950/30 dark:text-yellow-300">
            <Award className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-zinc-950 dark:text-white">
              {title}
            </h2>

            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Reconhecimentos especiais dentro da comunidade EntreUS.
            </p>
          </div>
        </div>

        {badges.length > 0 && (
          <span className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {badges.length} {badges.length === 1 ? 'selo' : 'selos'}
          </span>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-5 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Carregando selos...
        </div>
      )}

      {!loading && badges.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-200 p-5 text-center dark:border-zinc-700">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <Sparkles className="h-5 w-5" />
          </div>

          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {emptyMessage}
          </p>
        </div>
      )}

      {!loading && badges.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {badges.map((badge) => {
            const badgeTitle = getBadgeTitle(badge)
            const badgeDescription = getBadgeDescription(badge)

            return (
              <article
                key={badge.id}
                className="group rounded-2xl border border-zinc-200 bg-zinc-50 p-4 transition hover:-translate-y-[1px] hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                title={badgeDescription}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-black">
                    <img
                      src={badge.icon || `/badges/${badge.slug}.png`}
                      alt={`Selo ${badgeTitle}`}
                      className="h-full w-full object-contain"
                    />
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-zinc-950 dark:text-white">
                      {badgeTitle}
                    </h3>

                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {badgeDescription}
                    </p>

                    {badge.rarity && (
                      <p className="mt-2 inline-flex rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                        {badge.rarity}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}