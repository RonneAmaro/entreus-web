'use client'

import { type ReactNode, useId, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LIKER_DETAILS_LIMIT,
  LIKER_PREVIEW_LIMIT,
  type PublicLiker,
  summarizeLikers,
  uniqueLikerIds,
} from '@/lib/liker-details'
import { useLanguage } from './LanguageProvider'

type LikerDetailsRenderState = {
  likesPreview: string
  likesDetails: ReactNode
  likesDetailsId: string
  likesDetailsOpen: boolean
  likesDetailsLoading: boolean
  onLikesPreview: () => void
  onLikesDetails: () => void
  onCloseLikesDetails: () => void
}

type LikerDetailsProps = {
  likerIds: string[]
  children: (state: LikerDetailsRenderState) => ReactNode
}

export default function LikerDetails({ likerIds, children }: LikerDetailsProps) {
  const detailsId = useId()
  const uniqueIds = useMemo(() => uniqueLikerIds(likerIds), [likerIds])
  const likerIdsKey = uniqueIds.join(',')

  return <LikerDetailsContent key={likerIdsKey} uniqueIds={uniqueIds} detailsId={`post-liker-details-${detailsId}`}>{children}</LikerDetailsContent>
}

function LikerDetailsContent({
  uniqueIds,
  detailsId,
  children,
}: {
  uniqueIds: string[]
  detailsId: string
  children: LikerDetailsProps['children']
}) {
  const { language, t } = useLanguage()
  const [preview, setPreview] = useState<PublicLiker[]>([])
  const [details, setDetails] = useState<PublicLiker[]>([])
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  async function loadProfiles(limit: number) {
    const ids = uniqueIds.slice(0, limit)
    if (ids.length === 0) return []

    setLoading(true)
    setUnavailable(false)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', ids)

    setLoading(false)
    if (error) {
      setUnavailable(true)
      return []
    }

    const profilesById = new Map((data || []).map((profile) => [profile.id, profile as PublicLiker]))
    return ids.flatMap((id) => {
      const profile = profilesById.get(id)
      return profile ? [profile] : []
    })
  }

  function onLikesPreview() {
    if (preview.length > 0 || loading || uniqueIds.length === 0) return
    void loadProfiles(LIKER_PREVIEW_LIMIT).then((profiles) => setPreview(profiles))
  }

  function onLikesDetails() {
    if (uniqueIds.length === 0) return
    setDetailsOpen(true)
    if (details.length > 0) return
    void loadProfiles(LIKER_DETAILS_LIMIT).then((profiles) => setDetails(profiles))
  }

  const likesPreview = summarizeLikers(preview, uniqueIds.length, language)
  const visibleDetails = details.length > 0 ? details : preview
  const likesDetails = detailsOpen ? (
    <section
      id={detailsId}
      role="dialog"
      aria-modal="false"
      aria-label={t('post.actions.like')}
      className="absolute bottom-12 left-0 z-20 w-72 rounded-2xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-black">{t('post.actions.like')}</p>
        <button
          type="button"
          onClick={() => setDetailsOpen(false)}
          className="rounded-full px-2 py-1 text-xs font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label={t('common.close')}
        >
          ×
        </button>
      </div>
      {loading && <p role="status" className="text-sm text-zinc-500">{t('common.loading')}</p>}
      {!loading && unavailable && <p role="status" className="text-sm text-zinc-500">{t('common.unavailable')}</p>}
      {!loading && visibleDetails.length > 0 && (
        <ul className="space-y-2">
          {visibleDetails.map((liker) => {
            const name = liker.display_name || liker.username
            if (!name) return null
            return (
              <li key={liker.username || name} className="flex items-center gap-2 text-sm">
                {liker.avatar_url ? (
                  <img src={liker.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="h-7 w-7 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                )}
                <span className="min-w-0 truncate font-semibold">{name}</span>
                {liker.username && liker.display_name && (
                  <span className="min-w-0 truncate text-xs text-zinc-500">@{liker.username}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  ) : null

  return children({
    likesPreview,
    likesDetails,
    likesDetailsId: detailsId,
    likesDetailsOpen: detailsOpen,
    likesDetailsLoading: loading,
    onLikesPreview,
    onLikesDetails,
    onCloseLikesDetails: () => setDetailsOpen(false),
  })
}
