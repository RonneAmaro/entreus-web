'use client'

import { ExternalLink, Link2, Play } from 'lucide-react'
import { detectExternalEmbed } from '@/lib/external-embeds'

type LinkPreviewProps = {
  content: string | null
  enableExternalEmbeds?: boolean
}

function getFirstUrl(text: string) {
  const urlRegex = /(https?:\/\/[^\s<]+)/i
  const match = text.match(urlRegex)

  return match ? match[0] : null
}

function cleanUrl(url: string) {
  return url.replace(/[),.;!?]+$/g, '')
}

function getTrailingPunctuation(url: string) {
  const cleanedUrl = cleanUrl(url)

  return url.slice(cleanedUrl.length)
}

function getUrlMeta(url: string) {
  try {
    const parsedUrl = new URL(url)
    const domain = parsedUrl.hostname.replace(/^www\./, '')
    const description = `${parsedUrl.pathname}${parsedUrl.search}`.replace(/\/$/, '')

    return {
      domain,
      title: domain,
      description: description && description !== '/' ? description : url,
    }
  } catch {
    return {
      domain: 'link externo',
      title: 'Link externo',
      description: url,
    }
  }
}

export function LinkedPostText({
  content,
  className = '',
}: {
  content: string
  className?: string
}) {
  const urlRegex = /(https?:\/\/[^\s<]+)/gi
  const parts = content.split(urlRegex)

  return (
    <p className={className}>
      {parts.map((part, index) => {
        if (!part.match(urlRegex)) return part

        const url = cleanUrl(part)
        const trailingPunctuation = getTrailingPunctuation(part)

        return (
          <span key={`${url}-${index}`}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md font-medium text-blue-600 underline decoration-blue-400/40 underline-offset-4 transition hover:bg-blue-50 hover:text-blue-700 hover:decoration-blue-600 dark:text-blue-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"
            >
              {url}
            </a>
            {trailingPunctuation}
          </span>
        )
      })}
    </p>
  )
}

export default function LinkPreview({
  content,
  enableExternalEmbeds = false,
}: LinkPreviewProps) {
  if (!content) return null

  const rawUrl = getFirstUrl(content)

  if (!rawUrl) return null

  const url = cleanUrl(rawUrl)
  const externalEmbed = detectExternalEmbed(url)
  const meta = getUrlMeta(url)

  if (!externalEmbed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group mb-4 block overflow-hidden rounded-[1.5rem] bg-zinc-50/90 shadow-sm shadow-black/5 ring-1 ring-zinc-200/70 transition duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-lg hover:shadow-blue-500/10 hover:ring-blue-300/70 dark:bg-zinc-950/80 dark:ring-zinc-800/80 dark:hover:bg-zinc-900/90 dark:hover:ring-blue-500/40"
      >
        <div className="flex items-stretch">
          <div className="flex w-20 shrink-0 items-center justify-center bg-gradient-to-br from-blue-50 via-white to-zinc-100 text-blue-600 dark:from-blue-950/50 dark:via-zinc-950 dark:to-zinc-900 dark:text-blue-300 sm:w-24">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/80 shadow-sm ring-1 ring-zinc-200/80 transition group-hover:scale-105 dark:bg-zinc-900/80 dark:ring-zinc-700/80">
              <Link2 className="h-5 w-5" />
            </div>
          </div>

          <div className="min-w-0 flex-1 p-3.5 sm:p-4">
            <div className="mb-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
              <span className="truncate">{meta.domain}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </div>

            <p className="truncate text-sm font-bold text-zinc-950 dark:text-white">
              {meta.title}
            </p>

            <p className="mt-1 line-clamp-2 break-all text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {meta.description}
            </p>
          </div>
        </div>
      </a>
    )
  }

  if (!enableExternalEmbeds) {
    const thumbnailUrl = `https://img.youtube.com/vi/${externalEmbed.videoId}/hqdefault.jpg`

    return (
      <a
        href={externalEmbed.originalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group mb-4 block overflow-hidden rounded-[1.5rem] bg-zinc-50/90 shadow-sm shadow-black/5 ring-1 ring-zinc-200/70 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-red-500/10 hover:ring-red-300/70 dark:bg-zinc-950/80 dark:ring-zinc-800/80 dark:hover:bg-zinc-900/90 dark:hover:ring-red-500/40"
      >
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          <img
            src={thumbnailUrl}
            alt="Capa do video do YouTube"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />

          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-xl ring-1 ring-white/30 transition group-hover:scale-105 sm:h-16 sm:w-16">
              <Play className="ml-1 h-7 w-7 fill-current sm:h-8 sm:w-8" />
            </div>
          </div>
        </div>

        <div className="p-3.5 sm:p-4">
          <div className="mb-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
            <span className="truncate">youtube.com</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </div>

          <p className="text-sm font-bold text-zinc-950 dark:text-white">
            Video do YouTube
          </p>

          <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {externalEmbed.originalUrl}
          </p>
        </div>
      </a>
    )
  }

  return (
    <div
      className="mb-4 overflow-hidden rounded-[1.5rem] bg-zinc-950 shadow-sm shadow-black/10 ring-1 ring-zinc-200/70 dark:ring-zinc-800/80"
    >
      <div className="relative aspect-video w-full bg-black">
        <iframe
          src={externalEmbed.embedUrl}
          title="Video do YouTube incorporado"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>

      <div className="flex flex-col gap-3 bg-zinc-50/95 p-3.5 dark:bg-zinc-950/95 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">
            <span className="truncate">youtube.com</span>
          </div>

          <p className="text-sm font-bold text-zinc-950 dark:text-white">
            Video do YouTube
          </p>

          <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {externalEmbed.originalUrl}
          </p>
        </div>

        <a
          href={externalEmbed.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir video no YouTube em nova aba"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-3.5 py-2 text-sm font-bold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-50 dark:border-red-900/70 dark:bg-zinc-900 dark:text-red-200 dark:hover:border-red-700 dark:hover:bg-red-950/40"
        >
          YouTube
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}
