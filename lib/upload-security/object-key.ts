import { sanitizeUploadFileName } from './filename'
import type { UploadPolicy } from './policies'

const safeSegmentPattern = /^[\p{L}\p{N}._-]{1,100}$/u

export function isSafeObjectKeySegment(value: unknown): value is string {
  return typeof value === 'string' && safeSegmentPattern.test(value) && value !== '.' && value !== '..'
}

export function buildUploadObjectKey({ area, ownerId, fileName, policy, uuid }: {
  area: string
  ownerId: string
  fileName: string
  policy: UploadPolicy
  uuid?: () => string
}) {
  if (!isSafeObjectKeySegment(area) || !isSafeObjectKeySegment(ownerId)) throw new Error('Invalid object key segment.')
  const safeFileName = sanitizeUploadFileName(fileName, policy)
  if (!safeFileName) throw new Error('Invalid upload filename.')
  const objectId = (uuid || (() => crypto.randomUUID()))()
  if (!isSafeObjectKeySegment(objectId)) throw new Error('Invalid object key identifier.')
  return `${area}/${ownerId}/${objectId}/${safeFileName}`
}
