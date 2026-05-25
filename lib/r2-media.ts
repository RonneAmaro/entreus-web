const R2_MEDIA_PREFIXES = ['posts/', 'comments/'] as const

export type R2MediaPrefix = (typeof R2_MEDIA_PREFIXES)[number]

export function isAuditedR2MediaKey(value: string | null | undefined) {
  if (!value) return false

  return R2_MEDIA_PREFIXES.some((prefix) => value.startsWith(prefix))
}

export function extractR2KeyFromPublicUrl(value: unknown, publicBaseUrl: string | undefined) {
  if (typeof value !== 'string') return null

  const cleanValue = value.trim()
  const cleanBaseUrl = publicBaseUrl?.trim().replace(/\/+$/, '')

  if (!cleanValue || !cleanBaseUrl) return null

  if (isAuditedR2MediaKey(cleanValue)) return cleanValue

  try {
    const mediaUrl = new URL(cleanValue)
    const baseUrl = new URL(cleanBaseUrl)

    if (!['http:', 'https:'].includes(mediaUrl.protocol)) return null
    if (mediaUrl.origin !== baseUrl.origin) return null

    const basePath = baseUrl.pathname.replace(/\/+$/, '')
    if (basePath && !mediaUrl.pathname.startsWith(`${basePath}/`)) return null

    const keyPath = mediaUrl.pathname.slice(basePath.length).replace(/^\/+/, '')
    const key = decodeURIComponent(keyPath)

    return isAuditedR2MediaKey(key) ? key : null
  } catch {
    return null
  }
}

