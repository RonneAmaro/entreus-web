import { sanitizeUploadFileName } from './filename'
import type { UploadPolicy } from './policies'

const safeSegmentPattern = /^[\p{L}\p{N}._-]{1,100}$/u
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export function isSafeObjectKeySegment(value: unknown): value is string {
  return (
    typeof value === 'string'
    && safeSegmentPattern.test(value)
    && value !== '.'
    && value !== '..'
    && !value.includes('..')
  )
}

export function isValidUploadObjectId(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

export function buildUploadObjectKey({ area, ownerId, fileName, policy, uuid }: {
  area: string
  ownerId: string
  fileName: string
  policy: UploadPolicy
  uuid?: () => string
}) {
  if (!isSafeObjectKeySegment(area) || !isSafeObjectKeySegment(ownerId)) {
    throw new Error('Invalid object key segment.')
  }

  const safeFileName = sanitizeUploadFileName(fileName, policy)
  if (!safeFileName) throw new Error('Invalid upload filename.')

  const objectId = uuid ? uuid() : crypto.randomUUID()
  if (!isValidUploadObjectId(objectId)) throw new Error('Invalid object key identifier.')

  return `${area}/${ownerId}/${objectId}/${safeFileName}`
}
