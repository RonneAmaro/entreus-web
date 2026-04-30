'use client'

import { ExternalLink, Play } from 'lucide-react'

type LinkPreviewProps = {
  content: string | null
}

function getFirstUrl(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/i
  const match = text.match(urlRegex)

  return match ? match[0] : null
}

function getYouTubeVideoId(url: string) {
  try {
    const parsedUrl = new URL(url)

    if (parsedUrl.hostname.includes('youtube.com')) {
      const videoId = parsedUrl.searchParams.get('v')

      if (videoId) return videoId
    }

    if (parsedUrl.hostname.includes('youtu.be')) {
      const videoId = parsedUrl.pathname.replace('/', '')

      if (videoId) return videoId
    }

    if (parsedUrl.hostname.includes('youtube.com') && parsedUrl.pathname.includes('/shorts/')) {
      const parts = parsedUrl.pathname.split('/')
      const videoId = parts[2]

      if (videoId) return videoId
    }

    return null
  } catch {
    return null
  }
}

function cleanUrl(url: string) {
  return url.replace(/[),.;!?]+$/g, '')
}

export default function LinkPreview({ content }: LinkPreviewProps) {
  if (!content) return null

  const rawUrl = getFirstUrl(content)

  if (!rawUrl) return null

  const url = cleanUrl(rawUrl)
  const youtubeVideoId = getYouTubeVideoId(url)

  if (!youtubeVideoId) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-4 block overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        <div className="flex items-center gap-3 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <ExternalLink className="h-5 w-5" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
              Link externo
            </p>

            <p className="truncate text-xs text-zinc-500">
              {url}
            </p>
          </div>
        </div>
      </a>
    )
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-4 block overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 transition hover:opacity-95 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <img
          src={thumbnailUrl}
          alt="Capa do vídeo do YouTube"
          className="h-full w-full object-cover"
        />

        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-xl">
            <Play className="ml-1 h-8 w-8 fill-current" />
          </div>
        </div>
      </div>

      <div className="p-4">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          Vídeo do YouTube
        </p>

        <p className="mt-1 truncate text-xs text-zinc-500">
          {url}
        </p>
      </div>
    </a>
  )
}