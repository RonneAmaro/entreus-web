'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/app/components/LanguageProvider'
import { supabase } from '@/lib/supabase'

type Item = {
  id: string
  media_type: string
  status: string
  submitted_at: string
  previewUrl: string | null
  profile: {
    username: string | null
    display_name: string | null
    profile_content_mode: string
  } | null
}

type AccessState = 'checking' | 'authorized' | 'error'

function SignedPreview({ url, alt }: { url: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- signed R2 previews must bypass optimization and caching
  return <img src={url} alt={alt} referrerPolicy="no-referrer" className="h-64 w-full rounded-xl bg-black object-contain" />
}

export default function ProfileMediaAdminPage() {
  const router = useRouter()
  const { language, t } = useLanguage()
  const [items, setItems] = useState<Item[]>([])
  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [message, setMessage] = useState('')

  const locale = useMemo(() => language, [language])

  function formatDate(value: string) {
    try {
      return new Date(value).toLocaleString(locale)
    } catch {
      return t('admin.profileMedia.fallback.date')
    }
  }

  function getProfileName(item: Item) {
    return item.profile?.display_name || item.profile?.username || t('admin.profileMedia.fallback.user')
  }

  function getUsername(item: Item) {
    return item.profile?.username || t('admin.profileMedia.fallback.username')
  }

  function getStatusLabel(status: string) {
    if (status === 'pending_review') return t('admin.profileMedia.status.pendingReview')
    if (status === 'approved') return t('admin.profileMedia.status.approved')
    if (status === 'rejected') return t('admin.profileMedia.status.rejected')
    if (status === 'change_requested') return t('admin.profileMedia.status.changeRequested')
    return t('admin.profileMedia.status.unknown')
  }

  function getMediaTypeLabel(mediaType: string) {
    if (mediaType === 'avatar') return t('admin.profileMedia.mediaType.avatar')
    if (mediaType === 'banner') return t('admin.profileMedia.mediaType.banner')
    return t('admin.profileMedia.mediaType.unknown')
  }

  function getContentModeLabel(mode: string | null | undefined) {
    if (mode === 'general') return t('settings.contentModes.general.label')
    if (mode === 'adult') return t('settings.contentModes.adult.label')
    if (mode === 'mixed') return t('settings.contentModes.mixed.label')
    return t('admin.profileMedia.fallback.contentMode')
  }

  async function authHeaders() {
    const { data } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    try {
      const response = await fetch('/api/admin/profile-media-submissions', {
        headers: await authHeaders(),
        cache: 'no-store',
      })
      if (response.status === 401) {
        router.replace('/login')
        return
      }
      if (response.status === 403) {
        router.replace('/feed')
        return
      }
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage(t('admin.profileMedia.messages.accessCheckFailed'))
        setAccessState('error')
        return
      }
      setItems(data?.submissions || [])
      setAccessState('authorized')
    } catch {
      setMessage(t('admin.profileMedia.messages.accessCheckFailed'))
      setAccessState('error')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language])

  async function review(item: Item, decision: 'approved' | 'rejected' | 'change_requested') {
    const reason = decision === 'approved'
      ? ''
      : window.prompt(
          decision === 'rejected'
            ? t('admin.profileMedia.prompts.rejectReason')
            : t('admin.profileMedia.prompts.changeRequestedReason'),
        )?.trim()

    if (decision !== 'approved' && !reason) return

    const response = await fetch(`/api/admin/profile-media-submissions/${item.id}/review`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        decision,
        reason,
        category: decision === 'approved' ? 'safe' : decision === 'rejected' ? 'prohibited' : 'review',
      }),
    })

    const data = await response.json().catch(() => null)
    setMessage(response.ok ? t('admin.profileMedia.messages.reviewSaved') : t('admin.profileMedia.messages.reviewFailed'))
    if (!response.ok && data?.error) {
      setMessage(t('admin.profileMedia.messages.reviewFailed'))
    }
    await load()
  }

  if (accessState === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-300">
        <p>{t('admin.profileMedia.loading')}</p>
      </main>
    )
  }

  if (accessState === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-300">
        <p>{message}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin/moderation" className="text-sm text-blue-300">
          {t('admin.profileMedia.back')}
        </Link>
        <h1 className="mt-4 text-3xl font-bold">{t('admin.profileMedia.title')}</h1>
        <p className="mt-2 text-zinc-400">{t('admin.profileMedia.description')}</p>

        {message && <p className="mt-4 rounded-xl border border-zinc-700 p-3">{message}</p>}

        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-300">
            {t('admin.profileMedia.empty')}
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {items.map((item) => (
              <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                {item.previewUrl ? (
                  <SignedPreview url={item.previewUrl} alt={t('admin.profileMedia.previewAlt', { name: getProfileName(item) })} />
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-xl bg-black text-zinc-500">
                    {t('admin.profileMedia.previewUnavailable')}
                  </div>
                )}

                <div className="mt-3 text-sm">
                  <strong>{getProfileName(item)}</strong> · @{getUsername(item)}
                  <br />
                  {getContentModeLabel(item.profile?.profile_content_mode)} · {getMediaTypeLabel(item.media_type)} · {getStatusLabel(item.status)}
                  <br />
                  {formatDate(item.submitted_at)}
                </div>

                {item.status === 'pending_review' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => review(item, 'approved')} className="rounded-full bg-emerald-600 px-4 py-2">
                      {t('admin.profileMedia.actions.approve')}
                    </button>
                    <button onClick={() => review(item, 'rejected')} className="rounded-full bg-red-600 px-4 py-2">
                      {t('admin.profileMedia.actions.reject')}
                    </button>
                    <button onClick={() => review(item, 'change_requested')} className="rounded-full bg-amber-600 px-4 py-2">
                      {t('admin.profileMedia.actions.requestChange')}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
