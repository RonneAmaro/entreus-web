export const R2_MEDIA_PREFIXES = ['posts/', 'comments/', 'profiles/avatars/', 'profiles/banners/'] as const

export type R2MediaPrefix = (typeof R2_MEDIA_PREFIXES)[number]

function cleanDirectKey(value: string) {
  const key = value.trim().replace(/^\/+/, '')

  if (!key || key.includes('..') || key.includes('\\') || key.includes('?') || key.includes('#')) {
    return null
  }

  return isAuditedR2MediaKey(key) ? key : null
}

export function isAuditedR2MediaKey(value: string | null | undefined) {
  if (!value) return false

  return R2_MEDIA_PREFIXES.some((prefix) => value.startsWith(prefix))
}

export function extractR2MediaKey(value: unknown, publicBaseUrl: string | undefined) {
  if (typeof value !== 'string') return null

  const cleanValue = value.trim()
  const cleanBaseUrl = publicBaseUrl?.trim().replace(/\/+$/, '')

  if (!cleanValue) return null

  const directKey = cleanDirectKey(cleanValue)
  if (directKey) return directKey

  if (!cleanBaseUrl) return null

  try {
    const mediaUrl = new URL(cleanValue)
    const baseUrl = new URL(cleanBaseUrl)

    if (!['http:', 'https:'].includes(mediaUrl.protocol)) return null
    if (mediaUrl.origin !== baseUrl.origin) return null

    const basePath = baseUrl.pathname.replace(/\/+$/, '')
    if (basePath && !mediaUrl.pathname.startsWith(`${basePath}/`)) return null

    const keyPath = mediaUrl.pathname.slice(basePath.length).replace(/^\/+/, '')
    const key = cleanDirectKey(decodeURIComponent(keyPath))

    return key
  } catch {
    return null
  }
}

export const extractR2KeyFromPublicUrl = extractR2MediaKey
