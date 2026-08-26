import type { UploadPolicy } from './policies'

export const MAX_UPLOAD_FILENAME_LENGTH = 120

const unsafeNamePattern = /[/\\?\u0000-\u001f\u007f#]/u
const unsafeNamePatternGlobal = /[/\\?\u0000-\u001f\u007f#]/gu
const unsupportedFileNameCharacterPattern = /[^\p{L}\p{N}._ -]/gu

export function getNormalizedExtension(fileName: string) {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0 || dot === fileName.length - 1) return ''
  return fileName.slice(dot + 1).trim().toLowerCase()
}

export function isValidUploadFileName(fileName: unknown, policy: UploadPolicy) {
  if (typeof fileName !== 'string') return false

  const trimmed = fileName.trim()
  if (!trimmed || trimmed.length > MAX_UPLOAD_FILENAME_LENGTH) return false
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('../') || trimmed.includes('..\\')) return false
  if (unsafeNamePattern.test(trimmed)) return false

  return policy.allowedExtensions.includes(getNormalizedExtension(trimmed))
}

export function sanitizeUploadFileName(fileName: string, policy: UploadPolicy) {
  const extension = getNormalizedExtension(fileName)
  if (!policy.allowedExtensions.includes(extension)) return null

  const extensionSuffix = `.${extension}`
  const maxStemLength = MAX_UPLOAD_FILENAME_LENGTH - extensionSuffix.length
  const lastDot = fileName.lastIndexOf('.')
  const stem = fileName
    .slice(0, Math.max(0, lastDot))
    .normalize('NFKC')
    .replace(unsafeNamePatternGlobal, '-')
    .replace(/\.{2,}/g, '-')
    .replace(unsupportedFileNameCharacterPattern, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[. -]+|[. -]+$/g, '')
    .slice(0, maxStemLength)
    .replace(/[. -]+$/g, '')

  const sanitized = `${stem || 'arquivo'}${extensionSuffix}`
  return isValidUploadFileName(sanitized, policy) ? sanitized : null
}
