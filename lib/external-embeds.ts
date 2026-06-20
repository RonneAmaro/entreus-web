type VideoExternalEmbedProvider = 'youtube' | 'tiktok' | 'vimeo'

export type InstagramContentType = 'post' | 'reel' | 'tv' | 'story'
export type FacebookContentType = 'post' | 'video' | 'reel' | 'watch' | 'unknown'
export type ExternalEmbedProvider =
  | VideoExternalEmbedProvider
  | 'x'
  | 'instagram'
  | 'facebook'

type VideoExternalEmbed = {
  [Provider in VideoExternalEmbedProvider]: {
    provider: Provider
    videoId: string
    embedUrl: string
    originalUrl: string
  }
}[VideoExternalEmbedProvider]

type XExternalEmbed = {
  provider: 'x'
  postId: string
  username: string
  originalUrl: string
}

type InstagramExternalEmbed = {
  provider: 'instagram'
  postId: string
  username?: string
  contentType: InstagramContentType
  originalUrl: string
}

type FacebookExternalEmbed = {
  provider: 'facebook'
  postId?: string
  username?: string
  contentType: FacebookContentType
  embedUrl: string
  originalUrl: string
}

export type ExternalEmbed =
  | VideoExternalEmbed
  | XExternalEmbed
  | InstagramExternalEmbed
  | FacebookExternalEmbed

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const YOUTU_BE_HOSTS = new Set(['youtu.be', 'www.youtu.be'])
const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
])
const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
])
const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
])
const FACEBOOK_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'fb.watch',
])
const VIMEO_HOSTS = new Set([
  'vimeo.com',
  'www.vimeo.com',
  'player.vimeo.com',
])
const SAFE_YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{6,128}$/
const SAFE_TIKTOK_VIDEO_ID = /^\d{6,32}$/
const SAFE_VIMEO_VIDEO_ID = /^\d{6,32}$/
const SAFE_X_POST_ID = /^\d{6,32}$/
const SAFE_X_USERNAME = /^[A-Za-z0-9_]{1,15}$/
const SAFE_INSTAGRAM_CODE = /^[A-Za-z0-9_-]{3,128}$/
const SAFE_INSTAGRAM_USERNAME = /^[A-Za-z0-9._]{1,30}$/
const SAFE_INSTAGRAM_STORY_ID = /^\d{6,32}$/
const SAFE_FACEBOOK_PATH_PART = /^[A-Za-z0-9._-]{1,128}$/
const SAFE_FACEBOOK_CONTENT_ID = /^[A-Za-z0-9._-]{1,128}$/
const MAX_FACEBOOK_PATH_PARTS = 8
const FACEBOOK_EMBED_WIDTH = 500

function isSafeYouTubeVideoId(value: string | null) {
  return Boolean(value && SAFE_YOUTUBE_VIDEO_ID.test(value))
}

function isSafeTikTokVideoId(value: string | null) {
  return Boolean(value && SAFE_TIKTOK_VIDEO_ID.test(value))
}

function isSafeVimeoVideoId(value: string | null) {
  return Boolean(value && SAFE_VIMEO_VIDEO_ID.test(value))
}

function isSafeXPostId(value: string | null) {
  return Boolean(value && SAFE_X_POST_ID.test(value))
}

function isSafeXUsername(value: string | null) {
  return Boolean(value && SAFE_X_USERNAME.test(value))
}

function isSafeInstagramCode(value: string | null) {
  return Boolean(value && SAFE_INSTAGRAM_CODE.test(value))
}

function isSafeInstagramUsername(value: string | null) {
  return Boolean(value && SAFE_INSTAGRAM_USERNAME.test(value))
}

function isSafeInstagramStoryId(value: string | null) {
  return Boolean(value && SAFE_INSTAGRAM_STORY_ID.test(value))
}

function isSafeFacebookPathPart(value: string | null) {
  return Boolean(value && SAFE_FACEBOOK_PATH_PART.test(value))
}

function isSafeFacebookContentId(value: string | null) {
  return Boolean(value && SAFE_FACEBOOK_CONTENT_ID.test(value))
}

function getSafeFacebookContentId(value: string | null): string | undefined {
  return value && isSafeFacebookContentId(value) ? value : undefined
}

function areSafeFacebookPathParts(pathnameParts: string[]) {
  return (
    pathnameParts.length > 0 &&
    pathnameParts.length <= MAX_FACEBOOK_PATH_PARTS &&
    pathnameParts.every(isSafeFacebookPathPart)
  )
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

export function getVimeoVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null
    }

    if (!VIMEO_HOSTS.has(hostname)) {
      return null
    }

    const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean)
    const videoId =
      pathnameParts[0] === 'video'
        ? pathnameParts[1] || null
        : pathnameParts[0] || null

    return isSafeVimeoVideoId(videoId) ? videoId : null
  } catch {
    return null
  }
}

export function getVimeoEmbedUrl(videoId: string): string | null {
  if (!isSafeVimeoVideoId(videoId)) return null

  return `https://player.vimeo.com/video/${videoId}`
}

function getXPostDetails(url: string): { username: string; postId: string } | null {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null
    }

    if (!X_HOSTS.has(hostname)) {
      return null
    }

    const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean)
    const username = pathnameParts[0] || null
    const postId = pathnameParts[1] === 'status' ? pathnameParts[2] || null : null

    if (!username || !postId || !isSafeXUsername(username) || !isSafeXPostId(postId)) {
      return null
    }

    return {
      username,
      postId,
    }
  } catch {
    return null
  }
}

export function getXPostId(url: string): string | null {
  return getXPostDetails(url)?.postId || null
}

export function getXOriginalUrl(username: string, postId: string): string {
  return `https://x.com/${username}/status/${postId}`
}

function getInstagramDetails(url: string): {
  contentType: InstagramContentType
  postId: string
  username?: string
} | null {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null
    }

    if (!INSTAGRAM_HOSTS.has(hostname)) {
      return null
    }

    const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean)
    const contentTypeByPath: Record<string, InstagramContentType> = {
      p: 'post',
      reel: 'reel',
      tv: 'tv',
    }
    const contentType = contentTypeByPath[pathnameParts[0]]

    if (contentType) {
      const postId = pathnameParts[1] || null

      if (!postId || !isSafeInstagramCode(postId)) {
        return null
      }

      return {
        contentType,
        postId,
      }
    }

    if (pathnameParts[0] === 'stories') {
      const username = pathnameParts[1] || null
      const postId = pathnameParts[2] || null

      if (
        !username ||
        !postId ||
        !isSafeInstagramUsername(username) ||
        !isSafeInstagramStoryId(postId)
      ) {
        return null
      }

      return {
        contentType: 'story',
        username,
        postId,
      }
    }

    return null
  } catch {
    return null
  }
}

function getFacebookDetails(url: string): {
  contentType: FacebookContentType
  postId?: string
  username?: string
  originalUrl: string
} | null {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null
    }

    if (!FACEBOOK_HOSTS.has(hostname)) {
      return null
    }

    const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean)

    if (!areSafeFacebookPathParts(pathnameParts)) {
      return null
    }

    const originalUrl = parsedUrl.href

    if (hostname === 'fb.watch') {
      return {
        contentType: 'watch',
        postId: getSafeFacebookContentId(pathnameParts[0]),
        originalUrl,
      }
    }

    const videoId = getSafeFacebookContentId(parsedUrl.searchParams.get('v'))
    const storyId = getSafeFacebookContentId(
      parsedUrl.searchParams.get('story_fbid')
    )

    if (pathnameParts[0] === 'watch') {
      return {
        contentType: 'watch',
        postId: videoId,
        originalUrl,
      }
    }

    if (pathnameParts[0] === 'reel') {
      const postId = getSafeFacebookContentId(pathnameParts[1] || null)

      if (!postId) return null

      return {
        contentType: 'reel',
        postId,
        originalUrl,
      }
    }

    if (pathnameParts[0] === 'video.php') {
      return {
        contentType: 'video',
        postId: videoId,
        originalUrl,
      }
    }

    if (pathnameParts[0] === 'permalink.php') {
      return {
        contentType: 'post',
        postId: storyId,
        originalUrl,
      }
    }

    if (pathnameParts[0] === 'groups' && pathnameParts[2] === 'permalink') {
      const postId = getSafeFacebookContentId(pathnameParts[3] || null)

      if (!postId) return null

      return {
        contentType: 'post',
        username: pathnameParts[1],
        postId,
        originalUrl,
      }
    }

    if (pathnameParts[1] === 'posts') {
      const postId = getSafeFacebookContentId(pathnameParts[2] || null)

      if (!postId) return null

      return {
        contentType: 'post',
        username: pathnameParts[0],
        postId,
        originalUrl,
      }
    }

    if (pathnameParts[0] === 'videos' || pathnameParts[1] === 'videos') {
      const postId =
        pathnameParts[0] === 'videos'
          ? getSafeFacebookContentId(pathnameParts[1] || null)
          : getSafeFacebookContentId(pathnameParts[2] || null)

      if (!postId) return null

      return {
        contentType: 'video',
        username: pathnameParts[0] === 'videos' ? undefined : pathnameParts[0],
        postId,
        originalUrl,
      }
    }

    return {
      contentType: 'unknown',
      username: pathnameParts[0],
      originalUrl,
    }
  } catch {
    return null
  }
}

export function getInstagramPostId(url: string): string | null {
  return getInstagramDetails(url)?.postId || null
}

export function getInstagramOriginalUrl(
  contentType: InstagramContentType,
  postId: string,
  username?: string
): string {
  if (contentType === 'story' && username) {
    return `https://www.instagram.com/stories/${username}/${postId}/`
  }

  const path =
    contentType === 'reel'
      ? 'reel'
      : contentType === 'tv'
        ? 'tv'
        : 'p'

  return `https://www.instagram.com/${path}/${postId}/`
}

export function getFacebookEmbedUrl(
  contentType: FacebookContentType,
  originalUrl: string
): string {
  const pluginPath =
    contentType === 'video' || contentType === 'reel' || contentType === 'watch'
      ? 'video.php'
      : 'post.php'
  const showText = pluginPath === 'video.php' ? 'false' : 'true'
  const href = encodeURIComponent(originalUrl)

  return `https://www.facebook.com/plugins/${pluginPath}?href=${href}&show_text=${showText}&width=${FACEBOOK_EMBED_WIDTH}`
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

  if (tiktokVideoId && tiktokEmbedUrl) {
    return {
      provider: 'tiktok',
      videoId: tiktokVideoId,
      embedUrl: tiktokEmbedUrl,
      originalUrl: url,
    }
  }

  const vimeoVideoId = getVimeoVideoId(url)
  const vimeoEmbedUrl = vimeoVideoId ? getVimeoEmbedUrl(vimeoVideoId) : null

  if (vimeoVideoId && vimeoEmbedUrl) {
    return {
      provider: 'vimeo',
      videoId: vimeoVideoId,
      embedUrl: vimeoEmbedUrl,
      originalUrl: url,
    }
  }

  const xPostDetails = getXPostDetails(url)

  if (xPostDetails) {
    return {
      provider: 'x',
      username: xPostDetails.username,
      postId: xPostDetails.postId,
      originalUrl: getXOriginalUrl(xPostDetails.username, xPostDetails.postId),
    }
  }

  const instagramDetails = getInstagramDetails(url)

  if (instagramDetails) {
    return {
      provider: 'instagram',
      username: instagramDetails.username,
      postId: instagramDetails.postId,
      contentType: instagramDetails.contentType,
      originalUrl: getInstagramOriginalUrl(
        instagramDetails.contentType,
        instagramDetails.postId,
        instagramDetails.username
      ),
    }
  }

  const facebookDetails = getFacebookDetails(url)

  if (facebookDetails) {
    return {
      provider: 'facebook',
      username: facebookDetails.username,
      postId: facebookDetails.postId,
      contentType: facebookDetails.contentType,
      embedUrl: getFacebookEmbedUrl(
        facebookDetails.contentType,
        facebookDetails.originalUrl
      ),
      originalUrl: facebookDetails.originalUrl,
    }
  }

  return null
}
