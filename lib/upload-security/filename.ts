import type { UploadPolicy } from './policies'

export const MAX_UPLOAD_FILENAME_LENGTH = 120
const unsafeNamePattern = /[/\\?\u0000-\u001f\u007f#]/

export function getNormalizedExtension(fileName: string) {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0 || dot === fileName.length - 1) return ''
  return fileName.slice(dot + 1).trim().toLowerCase()
}

export function isValidUploadFileName(fileName: unknown, policy: UploadPolicy) {
  if (typeof fileName !== 'string') return false
  const trimmed = fileName.trim()
  if (!trimmed || trimmed.length > MAX_UPLOAD_FILENAME_LENGTH || trimmed === '.' || trimmed === '..') return false
  if (unsafeNamePattern.test(trimmed) || trimmed.includes('../') || trimmed.includes('..\\')) return false
  return policy.allowedExtensions.includes(getNormalizedExtension(trimmed))
}

export function sanitizeUploadFileName(fileName: string, policy: UploadPolicy) {
  const extension = getNormalizedExtension(fileName)
  if (!policy.allowedExtensions.includes(extension)) return null

  const extensionSuffix = `.${extension}`
  const maxStemLength = MAX_UPLOAD_FILENAME_LENGTH - extensionSuffix.length
  const stem = fileName
    .slice(0, Math.max(0, fileName.lastIndexOf('.')))
    .normalize('NFKC')
    .replace(/[/\\?\u0000-\u001f\u007f#]/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/[^\p{L}\p{N}._ -]/gu, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[. -]+|[. -]+$/g, '')
    .slice(0, maxStemLength)

  return `${stem || 'arquivo'}${extensionSuffix}`
}
