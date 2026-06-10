export type ExternalEmbedProvider = 'youtube' | 'tiktok'

export type ExternalEmbed = {
  provider: ExternalEmbedProvider
  videoId: string
  embedUrl: string
  originalUrl: string
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const YOUTU_BE_HOSTS = new Set(['youtu.be', 'www.youtu.be'])
const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
])
const SAFE_YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{6,128}$/
const SAFE_TIKTOK_VIDEO_ID = /^\d{6,32}$/

function isSafeYouTubeVideoId(value: string | null) {
  return Boolean(value && SAFE_YOUTUBE_VIDEO_ID.test(value))
}

function isSafeTikTokVideoId(value: string | null) {
  return Boolean(value && SAFE_TIKTOK_VIDEO_ID.test(value))
}

export function getYouTubeVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null
    }

    if (YOUTUBE_HOSTS.has(hostname)) {
      const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean)
      const videoId =
        pathnameParts[0] === 'shorts'
          ? pathnameParts[1] || null
          : parsedUrl.searchParams.get('v')

      return isSafeYouTubeVideoId(videoId) ? videoId : null
    }

    if (YOUTU_BE_HOSTS.has(hostname)) {
      const videoId = parsedUrl.pathname.split('/').filter(Boolean)[0] || null

      return isSafeYouTubeVideoId(videoId) ? videoId : null
    }

    return null
  } catch {
    return null
  }
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`
}

export function getTikTokVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null
    }

    if (!TIKTOK_HOSTS.has(hostname)) {
      return null
    }

    const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean)
    let videoId: string | null = null

    if (pathnameParts[0]?.startsWith('@') && pathnameParts[1] === 'video') {
      videoId = pathnameParts[2] || null
    } else if (pathnameParts[0] === 'v') {
      videoId = pathnameParts[1]?.replace(/\.html$/i, '') || null
    } else if (pathnameParts[0] === 'embed' && pathnameParts[1] === 'v2') {
      videoId = pathnameParts[2] || null
    }

    return isSafeTikTokVideoId(videoId) ? videoId : null
  } catch {
    return null
  }
}

export function getTikTokEmbedUrl(videoId: string): string | null {
  if (!isSafeTikTokVideoId(videoId)) return null

  return `https://www.tiktok.com/embed/v2/${videoId}`
}

export function detectExternalEmbed(url: string): ExternalEmbed | null {
  const youtubeVideoId = getYouTubeVideoId(url)

  if (youtubeVideoId) {
    return {
      provider: 'youtube',
      videoId: youtubeVideoId,
      embedUrl: getYouTubeEmbedUrl(youtubeVideoId),
      originalUrl: url,
    }
  }

  const tiktokVideoId = getTikTokVideoId(url)
  const tiktokEmbedUrl = tiktokVideoId ? getTikTokEmbedUrl(tiktokVideoId) : null

  if (!tiktokVideoId || !tiktokEmbedUrl) return null

  return {
    provider: 'tiktok',
    videoId: tiktokVideoId,
    embedUrl: tiktokEmbedUrl,
    originalUrl: url,
  }
}
