export type ExternalEmbed = {
  provider: 'youtube'
  videoId: string
  embedUrl: string
  originalUrl: string
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const YOUTU_BE_HOSTS = new Set(['youtu.be', 'www.youtu.be'])
const SAFE_YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{6,128}$/

function isSafeYouTubeVideoId(value: string | null) {
  return Boolean(value && SAFE_YOUTUBE_VIDEO_ID.test(value))
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

export function detectExternalEmbed(url: string): ExternalEmbed | null {
  const videoId = getYouTubeVideoId(url)

  if (!videoId) return null

  return {
    provider: 'youtube',
    videoId,
    embedUrl: getYouTubeEmbedUrl(videoId),
    originalUrl: url,
  }
}
