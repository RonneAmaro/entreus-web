'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, ExternalLink, Link2, Play } from 'lucide-react'
import { detectExternalEmbed, type ExternalEmbed } from '@/lib/external-embeds'

type LinkPreviewProps = {
  content: string | null
  enableExternalEmbeds?: boolean
}

type IframeExternalEmbed = Extract<
  ExternalEmbed,
  { provider: 'youtube' | 'tiktok' | 'vimeo' }
>
type YouTubeExternalEmbed = Extract<ExternalEmbed, { provider: 'youtube' }>
type XExternalEmbed = Extract<ExternalEmbed, { provider: 'x' }>
type InstagramExternalEmbed = Extract<ExternalEmbed, { provider: 'instagram' }>
type FacebookExternalEmbed = Extract<ExternalEmbed, { provider: 'facebook' }>

declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process: (container?: HTMLElement) => void
      }
    }
  }
}

type EmbedDisplay = {
  providerLabel: string
  title: string
  iframeTitle: string
  buttonLabel: string
  ariaLabel: string
  mark: ReactNode
  markClassName: string
  actionClassName: string
  frameWrapClassName: string
  frameClassName: string
  allow: string
  sandbox: string
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

function ExternalActionLink({
  href,
  label,
  ariaLabel,
  className,
}: {
  href: string
  label: string
  ariaLabel: string
  className: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={`inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 sm:w-auto ${className}`}
    >
      {label}
      <ExternalLink className="h-4 w-4" />
    </a>
  )
}

function ProviderMark({
  children,
  className,
}: {
  children: ReactNode
  className: string
}) {
  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${className}`}
    >
      {children}
    </div>
  )
}

function EmbedShell({
  providerLabel,
  title,
  subtitle,
  originalUrl,
  buttonLabel,
  ariaLabel,
  actionClassName,
  mark,
  markClassName,
  children,
}: {
  providerLabel: string
  title: string
  subtitle?: ReactNode
  originalUrl: string
  buttonLabel: string
  ariaLabel: string
  actionClassName: string
  mark: ReactNode
  markClassName: string
  children: ReactNode
}) {
  return (
    <div className="group/embed mb-4 overflow-hidden rounded-[1.35rem] border border-zinc-200/75 bg-white/95 shadow-sm shadow-black/5 ring-1 ring-black/[0.02] transition duration-300 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-950/95 dark:ring-white/[0.03] dark:hover:border-zinc-700">
      <div className="flex flex-col gap-3 border-b border-zinc-200/70 bg-zinc-50/80 px-3.5 py-3 dark:border-zinc-800/80 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <ProviderMark className={markClassName}>
            {mark}
          </ProviderMark>

          <div className="min-w-0">
            <div className="mb-0.5 text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
              {providerLabel}
            </div>

            <p className="truncate text-sm font-black text-zinc-950 dark:text-white">
              {title}
            </p>

            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {subtitle}
              </div>
            )}
          </div>
        </div>

        <ExternalActionLink
          href={originalUrl}
          label={buttonLabel}
          ariaLabel={ariaLabel}
          className={actionClassName}
        />
      </div>

      {children}

      <div className="border-t border-zinc-200/70 bg-white/90 px-3.5 py-2.5 dark:border-zinc-800/80 dark:bg-zinc-950/95 sm:px-4">
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {originalUrl}
        </p>
      </div>
    </div>
  )
}

function getEmbedDisplay(embed: IframeExternalEmbed): EmbedDisplay {
  if (embed.provider === 'tiktok') {
    return {
      providerLabel: 'TikTok',
      title: 'Video do TikTok',
      iframeTitle: 'Video do TikTok incorporado',
      buttonLabel: 'Abrir no TikTok',
      ariaLabel: 'Abrir video no TikTok em nova aba',
      mark: <span className="text-base font-black">T</span>,
      markClassName: 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950',
      actionClassName:
        'border-zinc-300 bg-white text-zinc-950 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:hover:border-zinc-500 dark:hover:bg-zinc-800',
      frameWrapClassName: 'flex justify-center bg-zinc-950 p-2 sm:p-3',
      frameClassName:
        'relative aspect-[9/16] w-full max-w-[20rem] overflow-hidden rounded-[1.1rem] bg-black shadow-2xl shadow-black/30 sm:rounded-[1.25rem]',
      allow:
        'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share',
      sandbox:
        'allow-scripts allow-same-origin allow-presentation allow-popups',
    }
  }

  if (embed.provider === 'vimeo') {
    return {
      providerLabel: 'Vimeo',
      title: 'Video do Vimeo',
      iframeTitle: 'Video do Vimeo incorporado',
      buttonLabel: 'Abrir no Vimeo',
      ariaLabel: 'Abrir video no Vimeo em nova aba',
      mark: <span className="text-base font-black">V</span>,
      markClassName: 'bg-sky-500 text-white',
      actionClassName:
        'border-sky-200 bg-white text-sky-700 hover:border-sky-300 hover:bg-sky-50 dark:border-sky-900/70 dark:bg-zinc-900 dark:text-sky-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/40',
      frameWrapClassName: 'bg-zinc-950 p-1 sm:p-1.5',
      frameClassName:
        'relative aspect-video w-full overflow-hidden rounded-[1rem] bg-black sm:rounded-[1.2rem]',
      allow: 'autoplay; clipboard-write; fullscreen; picture-in-picture',
      sandbox:
        'allow-scripts allow-same-origin allow-presentation allow-popups',
    }
  }

  return {
    providerLabel: 'YouTube',
    title: 'Video do YouTube',
    iframeTitle: 'Video do YouTube incorporado',
    buttonLabel: 'Abrir no YouTube',
    ariaLabel: 'Abrir video no YouTube em nova aba',
    mark: <Play className="ml-0.5 h-5 w-5 fill-current" />,
    markClassName: 'bg-red-600 text-white',
    actionClassName:
      'border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50 dark:border-red-900/70 dark:bg-zinc-900 dark:text-red-200 dark:hover:border-red-700 dark:hover:bg-red-950/40',
    frameWrapClassName: 'bg-zinc-950 p-1 sm:p-1.5',
    frameClassName:
      'relative aspect-video w-full overflow-hidden rounded-[1rem] bg-black sm:rounded-[1.2rem]',
    allow:
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    sandbox:
      'allow-scripts allow-same-origin allow-presentation allow-popups',
  }
}

function XPostPreview({ embed }: { embed: XExternalEmbed }) {
  return (
    <EmbedShell
      providerLabel="X/Twitter"
      title="Publicacao no X/Twitter"
      subtitle={`@${embed.username}`}
      originalUrl={embed.originalUrl}
      buttonLabel="Abrir no X"
      ariaLabel="Abrir publicacao no X em nova aba"
      mark={<span className="text-base font-black">X</span>}
      markClassName="bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
      actionClassName="border-zinc-300 bg-white text-zinc-950 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
    >
      <div className="bg-zinc-50/60 p-3.5 dark:bg-zinc-950/60 sm:p-4">
        <div className="rounded-[1.1rem] border border-zinc-200/70 bg-white p-4 dark:border-zinc-800/80 dark:bg-zinc-900/40">
          <p className="text-sm font-semibold text-zinc-950 dark:text-white">
            Publicacao no X/Twitter
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-semibold dark:border-zinc-800 dark:bg-zinc-950">
              @{embed.username}
            </span>

            <span className="max-w-full truncate rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 dark:border-zinc-800 dark:bg-zinc-950">
              ID {embed.postId}
            </span>
          </div>
        </div>
      </div>
    </EmbedShell>
  )
}

function getFacebookContentLabel(contentType: FacebookExternalEmbed['contentType']) {
  if (contentType === 'post') return 'Publicacao'
  if (contentType === 'video') return 'Video'
  if (contentType === 'reel') return 'Reel'
  if (contentType === 'watch') return 'Watch'
  return 'Link'
}

function FacebookPreview({ embed }: { embed: FacebookExternalEmbed }) {
  const contentLabel = getFacebookContentLabel(embed.contentType)
  const isVerticalVideo =
    embed.contentType === 'reel' || embed.contentType === 'watch'

  return (
    <EmbedShell
      providerLabel="Facebook"
      title={`${contentLabel} no Facebook`}
      subtitle={embed.username ? `@${embed.username}` : undefined}
      originalUrl={embed.originalUrl}
      buttonLabel="Abrir no Facebook"
      ariaLabel="Abrir conteudo no Facebook em nova aba"
      mark={<span className="text-lg font-black">f</span>}
      markClassName="bg-blue-600 text-white"
      actionClassName="border-blue-200 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-50 dark:border-blue-900/70 dark:bg-zinc-900 dark:text-blue-200 dark:hover:border-blue-700 dark:hover:bg-blue-950/40"
    >
      <div className="bg-zinc-50/60 p-3.5 dark:bg-zinc-950/60 sm:p-4">
        <div className="flex justify-center">
          <div
            className={`relative w-full max-w-[31.25rem] overflow-hidden rounded-[1.1rem] border border-blue-100 bg-white shadow-sm dark:border-blue-950/70 dark:bg-zinc-900/40 ${
              isVerticalVideo ? 'aspect-[9/16]' : 'aspect-video'
            }`}
          >
            <iframe
              src={embed.embedUrl}
              title={`${contentLabel} do Facebook incorporado`}
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        </div>
      </div>
    </EmbedShell>
  )
}

function getInstagramContentLabel(contentType: InstagramExternalEmbed['contentType']) {
  if (contentType === 'reel') return 'Reels'
  if (contentType === 'tv') return 'IGTV'
  if (contentType === 'story') return 'Story'
  return 'Publicacao'
}

function InstagramPreview({ embed }: { embed: InstagramExternalEmbed }) {
  const contentLabel = getInstagramContentLabel(embed.contentType)
  const containerRef = useRef<HTMLDivElement>(null)
  const [embedState, setEmbedState] = useState<'loading' | 'ready' | 'blocked'>(
    'loading'
  )

  useEffect(() => {
    let cancelled = false
    let fallbackTimer: number | null = null

    const processEmbed = () => {
      if (cancelled) return

      window.instgrm?.Embeds?.process(containerRef.current || undefined)

      fallbackTimer = window.setTimeout(() => {
        if (cancelled) return

        const hasIframe = Boolean(containerRef.current?.querySelector('iframe'))
        setEmbedState(hasIframe ? 'ready' : 'blocked')
      }, 3000)
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.instagram.com/embed.js"]'
    )

    if (window.instgrm?.Embeds?.process) {
      processEmbed()
    } else if (existingScript) {
      existingScript.addEventListener('load', processEmbed, { once: true })
      existingScript.addEventListener('error', () => setEmbedState('blocked'), {
        once: true,
      })
    } else {
      const script = document.createElement('script')
      script.src = 'https://www.instagram.com/embed.js'
      script.async = true
      script.onload = processEmbed
      script.onerror = () => setEmbedState('blocked')
      document.body.appendChild(script)
    }

    return () => {
      cancelled = true
      if (fallbackTimer) window.clearTimeout(fallbackTimer)
      existingScript?.removeEventListener('load', processEmbed)
    }
  }, [embed.originalUrl])

  return (
    <EmbedShell
      providerLabel="Instagram"
      title={`${contentLabel} no Instagram`}
      subtitle={embed.username ? `@${embed.username}` : undefined}
      originalUrl={embed.originalUrl}
      buttonLabel="Abrir no Instagram"
      ariaLabel="Abrir conteudo no Instagram em nova aba"
      mark={<Camera className="h-5 w-5" />}
      markClassName="bg-pink-600 text-white"
      actionClassName="border-pink-200 bg-white text-pink-700 hover:border-pink-300 hover:bg-pink-50 dark:border-pink-900/70 dark:bg-zinc-900 dark:text-pink-200 dark:hover:border-pink-700 dark:hover:bg-pink-950/40"
    >
      <div
        ref={containerRef}
        className="bg-zinc-50/60 p-3.5 dark:bg-zinc-950/60 sm:p-4"
      >
        {embedState !== 'blocked' && (
          <blockquote
            className="instagram-media mx-auto w-full min-w-0 max-w-[33.75rem] overflow-hidden rounded-[1.1rem] border border-pink-100 bg-white shadow-sm dark:border-pink-950/70"
            data-instgrm-captioned
            data-instgrm-permalink={embed.originalUrl}
            data-instgrm-version="14"
          >
            <a
              href={embed.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 text-sm font-semibold text-pink-700 dark:text-pink-200"
            >
              {contentLabel} no Instagram
            </a>
          </blockquote>
        )}

        {embedState === 'loading' && (
          <div className="mx-auto mt-3 w-full max-w-[33.75rem] rounded-[1.1rem] border border-pink-100 bg-white p-4 dark:border-pink-950/70 dark:bg-zinc-900/40">
            <div className="h-3 w-28 rounded-full bg-pink-100 dark:bg-pink-950/50" />
            <div className="mt-3 h-3 w-3/4 rounded-full bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-2 h-3 w-1/2 rounded-full bg-zinc-100 dark:bg-zinc-800" />
          </div>
        )}

        {embedState === 'blocked' && (
          <div className="mx-auto w-full max-w-[33.75rem] rounded-[1.1rem] border border-pink-100 bg-white p-4 dark:border-pink-950/70 dark:bg-zinc-900/40">
            <p className="text-sm font-semibold text-zinc-950 dark:text-white">
              {contentLabel} no Instagram
            </p>

            <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              O Instagram nao liberou o embed aqui. Use o botao acima para abrir
              o conteudo original.
            </p>
          </div>
        )}
      </div>
    </EmbedShell>
  )
}

function GenericLinkPreview({
  url,
  meta,
}: {
  url: string
  meta: ReturnType<typeof getUrlMeta>
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group mb-4 block overflow-hidden rounded-[1.35rem] border border-zinc-200/75 bg-white/95 shadow-sm shadow-black/5 ring-1 ring-black/[0.02] transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/10 dark:border-zinc-800/80 dark:bg-zinc-950/95 dark:ring-white/[0.03] dark:hover:border-zinc-700"
    >
      <div className="flex items-stretch">
        <div className="flex w-20 shrink-0 items-center justify-center bg-zinc-50 text-blue-600 dark:bg-zinc-950 dark:text-blue-300 sm:w-24">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/80 transition group-hover:scale-105 dark:bg-zinc-900/80 dark:ring-zinc-700/80">
            <Link2 className="h-5 w-5" />
          </div>
        </div>

        <div className="min-w-0 flex-1 p-3.5 sm:p-4">
          <div className="mb-1 flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
            <span className="truncate">{meta.domain}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </div>

          <p className="truncate text-sm font-black text-zinc-950 dark:text-white">
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

function YouTubeThumbnailPreview({ embed }: { embed: YouTubeExternalEmbed }) {
  const thumbnailUrl = `https://img.youtube.com/vi/${embed.videoId}/hqdefault.jpg`

  return (
    <a
      href={embed.originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group mb-4 block overflow-hidden rounded-[1.35rem] border border-zinc-200/75 bg-white/95 shadow-sm shadow-black/5 ring-1 ring-black/[0.02] transition duration-300 hover:-translate-y-0.5 hover:border-red-200 hover:shadow-lg hover:shadow-red-500/10 dark:border-zinc-800/80 dark:bg-zinc-950/95 dark:ring-white/[0.03] dark:hover:border-red-900/70"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <img
          src={thumbnailUrl}
          alt="Capa do video do YouTube"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />

        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-xl ring-1 ring-white/30 transition group-hover:scale-105 sm:h-16 sm:w-16">
            <Play className="ml-1 h-7 w-7 fill-current sm:h-8 sm:w-8" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
            <span className="truncate">YouTube</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </div>

          <p className="text-sm font-black text-zinc-950 dark:text-white">
            Video do YouTube
          </p>

          <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {embed.originalUrl}
          </p>
        </div>
      </div>
    </a>
  )
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

  if (!externalEmbed || (!enableExternalEmbeds && externalEmbed.provider !== 'youtube')) {
    return <GenericLinkPreview url={url} meta={meta} />
  }

  if (!enableExternalEmbeds && externalEmbed.provider === 'youtube') {
    return <YouTubeThumbnailPreview embed={externalEmbed} />
  }

  if (externalEmbed.provider === 'x') {
    return <XPostPreview embed={externalEmbed} />
  }

  if (externalEmbed.provider === 'instagram') {
    return <InstagramPreview embed={externalEmbed} />
  }

  if (externalEmbed.provider === 'facebook') {
    return <FacebookPreview embed={externalEmbed} />
  }

  const embedDisplay = getEmbedDisplay(externalEmbed)

  return (
    <EmbedShell
      providerLabel={embedDisplay.providerLabel}
      title={embedDisplay.title}
      originalUrl={externalEmbed.originalUrl}
      buttonLabel={embedDisplay.buttonLabel}
      ariaLabel={embedDisplay.ariaLabel}
      mark={embedDisplay.mark}
      markClassName={embedDisplay.markClassName}
      actionClassName={embedDisplay.actionClassName}
    >
      <div className={embedDisplay.frameWrapClassName}>
        <div className={embedDisplay.frameClassName}>
          <iframe
            src={externalEmbed.embedUrl}
            title={embedDisplay.iframeTitle}
            loading="lazy"
            allow={embedDisplay.allow}
            allowFullScreen
            sandbox={embedDisplay.sandbox}
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      </div>
    </EmbedShell>
  )
}
