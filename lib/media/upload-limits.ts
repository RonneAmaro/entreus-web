export const IMAGE_UPLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024
export const VIDEO_UPLOAD_MAX_SIZE_BYTES = 30 * 1024 * 1024
export const POST_VIDEO_MAX_DURATION_SECONDS = 60
export const HEAVY_VIDEO_WARNING_SIZE_BYTES = 20 * 1024 * 1024

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

export function getUploadMaxSizeBytes(contentType: string) {
  if (isAllowedVideoMimeType(contentType)) return VIDEO_UPLOAD_MAX_SIZE_BYTES
  if (isAllowedImageMimeType(contentType)) return IMAGE_UPLOAD_MAX_SIZE_BYTES
  return null
}

export function looksLikeVideoUpload(contentType: unknown, fileName: string) {
  const normalizedContentType = typeof contentType === 'string' ? contentType.trim().toLowerCase() : ''

  return normalizedContentType.startsWith('video/') || knownVideoExtensions.has(getUploadFileExtension(fileName))
}
