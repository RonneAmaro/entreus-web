'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type ProtectedPostMediaProps = {
  media: {
    id: string
    media_type: 'image' | 'video' | 'gif'
    media_url?: string | null
    access_level?: string | null
  }
  adultPost?: boolean
  alt?: string
  className?: string
}

const BLOCKED_MESSAGE = 'Este conteúdo não está disponível para sua conta.'

export default function ProtectedPostMedia({ media, adultPost = false, alt = 'Mídia da publicação', className = '' }: ProtectedPostMediaProps) {
  const isPrivateAdultMedia = media.access_level === 'adult_private'
  const isProtectedMedia = isPrivateAdultMedia || media.access_level === 'protected' || !media.media_url
  const isLegacyAdultMedia = adultPost && !isPrivateAdultMedia
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'blocked'>('loading')

  useEffect(() => {
    let active = true
    if (!isProtectedMedia) {
      setState(isLegacyAdultMedia ? 'blocked' : 'ready')
      return () => { active = false }
    }

    async function requestSignedUrl() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch(`/api/post-media/${encodeURIComponent(media.id)}/signed-url`, {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        })
        const payload = await response.json().catch(() => null) as { url?: unknown } | null
        if (!response.ok || typeof payload?.url !== 'string') throw new Error('blocked')
        if (active) { setUrl(payload.url); setState('ready') }
      } catch {
        if (active) setState('blocked')
      }
    }
    requestSignedUrl()
    return () => { active = false }
  }, [isLegacyAdultMedia, isProtectedMedia, media.id])

  if (isLegacyAdultMedia) return <div className={`flex min-h-32 items-center justify-center rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 ${className}`}>Mídia protegida indisponível.</div>
  if (state === 'loading') return <div className={`flex min-h-32 items-center justify-center rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 ${className}`}>Carregando mídia protegida...</div>
  if (state === 'blocked') return <div className={`flex min-h-32 items-center justify-center rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 ${className}`}>{BLOCKED_MESSAGE}</div>

  const source = isProtectedMedia ? url : media.media_url
  if (!source) return <div className={`flex min-h-32 items-center justify-center rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 ${className}`}>{BLOCKED_MESSAGE}</div>
  if (media.media_type === 'video') return <video src={source} controls playsInline preload="metadata" className={className} />
  return <img src={source} alt={alt} loading="lazy" decoding="async" className={className} />
}
