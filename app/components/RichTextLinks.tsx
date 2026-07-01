import Link from 'next/link'
import { Fragment } from 'react'
import {
  getCommunityHref,
  getMentionHref,
  parseRichTextLinks,
  type RichTextToken,
} from '@/lib/rich-text-links'

type RichTextLinksProps = {
  text: string
  className?: string
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/gi

function cleanUrl(url: string) {
  return url.replace(/[),.;!?]+$/g, '')
}

function getTrailingPunctuation(url: string) {
  const cleanedUrl = cleanUrl(url)

  return url.slice(cleanedUrl.length)
}

function renderToken(token: RichTextToken, key: string) {
  if (token.type === 'text') return <Fragment key={key}>{token.value}</Fragment>

  if (token.type === 'mention') {
    return (
      <Link
        key={key}
        href={getMentionHref(token.username)}
        aria-label={`Abrir perfil de ${token.value}`}
        className="rounded-sm font-semibold text-cyan-600 transition hover:underline hover:decoration-cyan-500/70 hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 dark:text-cyan-300"
      >
        {token.value}
      </Link>
    )
  }

  return (
    <Link
      key={key}
      href={getCommunityHref(token.slug)}
      aria-label={`Abrir comunidade ${token.value}`}
      className="rounded-sm font-semibold text-emerald-600 transition hover:underline hover:decoration-emerald-500/70 hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:text-emerald-300"
    >
      {token.value}
    </Link>
  )
}

function renderRichSegment(segment: string, segmentKey: string) {
  return parseRichTextLinks(segment).map((token, index) =>
    renderToken(token, `${segmentKey}-${token.type}-${index}`),
  )
}

export default function RichTextLinks({ text, className = '' }: RichTextLinksProps) {
  const parts = text.split(URL_REGEX)

  return (
    <p className={className}>
      {parts.map((part, index) => {
        if (!part.match(URL_REGEX)) return renderRichSegment(part, `text-${index}`)

        const url = cleanUrl(part)
        const trailingPunctuation = getTrailingPunctuation(part)

        return (
          <span key={`${url}-${index}`}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md font-medium text-blue-600 underline decoration-blue-400/40 underline-offset-4 transition hover:bg-blue-50 hover:text-blue-700 hover:decoration-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:text-blue-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"
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
