import { resolveUserTier, type UserTier, type UserTierEntitlement } from '@/lib/user-tiers'

export const BYTES_PER_MEGABYTE = 1024 * 1024

export const IMAGE_UPLOAD_MAX_SIZE_BYTES = 5 * BYTES_PER_MEGABYTE
export const VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES = 50 * BYTES_PER_MEGABYTE
export const VIDEO_UPLOAD_VIP_MAX_SIZE_BYTES = 200 * BYTES_PER_MEGABYTE
export const VIDEO_UPLOAD_ELDER_MAX_SIZE_BYTES = 500 * BYTES_PER_MEGABYTE

// Keep the existing default export name for callers that do not have user entitlements.
export const VIDEO_UPLOAD_MAX_SIZE_BYTES = VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES
export const POST_VIDEO_MAX_DURATION_SECONDS = 60
export const HEAVY_VIDEO_WARNING_SIZE_BYTES = 40 * BYTES_PER_MEGABYTE

export type VideoUploadTier = UserTier
export type VideoUploadEntitlement = UserTierEntitlement

export type VideoUploadLimit = {
  tier: VideoUploadTier
  maxSizeBytes: number
}

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const

export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const
export const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'] as const

export const UPLOAD_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export const UPLOAD_MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

const allowedImageMimeTypes = new Set<string>(ALLOWED_IMAGE_MIME_TYPES)
const allowedVideoMimeTypes = new Set<string>(ALLOWED_VIDEO_MIME_TYPES)
const genericMimeTypes = new Set(['', 'application/octet-stream'])
const knownVideoExtensions = new Set([
  ...ALLOWED_VIDEO_EXTENSIONS,
  'avi',
  'm4v',
  'mkv',
  'ogg',
  'ogv',
])

export function formatUploadBytes(bytes: number) {
  const normalizedBytes = Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes) : 0

  if (normalizedBytes === 0) return '0 B'

  const megabytes = normalizedBytes / (1024 * 1024)

  if (megabytes >= 1) {
    const roundedMegabytes = Math.round(megabytes * 10) / 10
    return `${formatUploadSizeValue(roundedMegabytes)} MB`
  }

  const kilobytes = normalizedBytes / 1024

  if (kilobytes >= 1) {
    return `${Math.round(kilobytes)} KB`
  }

  return `${normalizedBytes} B`
}

export function formatUploadLimitMegabytes(bytes: number) {
  const megabytes = Math.max(0, Math.round(bytes / BYTES_PER_MEGABYTE))
  return `${megabytes} MB`
}

export function resolveVideoUploadLimit(
  entitlement: VideoUploadEntitlement = {},
  now = Date.now(),
): VideoUploadLimit {
  const tier = resolveUserTier(entitlement, now)

  if (tier === 'elder') {
    return {
      tier: 'elder',
      maxSizeBytes: VIDEO_UPLOAD_ELDER_MAX_SIZE_BYTES,
    }
  }

  if (tier === 'vip' || tier === 'vip_premium') {
    return {
      tier,
      maxSizeBytes: VIDEO_UPLOAD_VIP_MAX_SIZE_BYTES,
    }
  }

  return {
    tier: 'standard',
    maxSizeBytes: VIDEO_UPLOAD_STANDARD_MAX_SIZE_BYTES,
  }
}

function formatUploadSizeValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function getUploadFileExtension(fileName: string) {
  const extension = fileName.trim().toLowerCase().split('.').pop()
  return extension && extension !== fileName.toLowerCase() ? extension : ''
}

export function isAllowedImageMimeType(contentType: string) {
  return allowedImageMimeTypes.has(contentType)
}

export function isAllowedVideoMimeType(contentType: string) {
  return allowedVideoMimeTypes.has(contentType)
}

export function isAllowedUploadMimeType(contentType: string) {
  return isAllowedImageMimeType(contentType) || isAllowedVideoMimeType(contentType)
}

export function getAllowedUploadContentType(contentType: unknown, fileName: string) {
  const normalizedContentType = typeof contentType === 'string' ? contentType.trim().toLowerCase() : ''

  if (!genericMimeTypes.has(normalizedContentType)) {
    return isAllowedUploadMimeType(normalizedContentType) ? normalizedContentType : null
  }

  return UPLOAD_MIME_TYPE_BY_EXTENSION[getUploadFileExtension(fileName)] || null
}

export function getUploadMaxSizeBytes(
  contentType: string,
  entitlement?: VideoUploadEntitlement,
) {
  if (isAllowedVideoMimeType(contentType)) return resolveVideoUploadLimit(entitlement).maxSizeBytes
  if (isAllowedImageMimeType(contentType)) return IMAGE_UPLOAD_MAX_SIZE_BYTES
  return null
}

export function looksLikeVideoUpload(contentType: unknown, fileName: string) {
  const normalizedContentType = typeof contentType === 'string' ? contentType.trim().toLowerCase() : ''

  return normalizedContentType.startsWith('video/') || knownVideoExtensions.has(getUploadFileExtension(fileName))
}
