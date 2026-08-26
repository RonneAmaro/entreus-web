import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  getUploadPolicy,
  isValidUploadFileName,
  isValidUploadObjectId,
  normalizeDeclaredMime,
  validateFileSignatureSample,
} from '@/lib/upload-security'
import type { MessageAttachmentMediaType, MessageAttachmentRow, PendingAttachmentRow } from './security'

export const MESSAGE_ATTACHMENTS_PRIVATE_PREFIX = 'private/messages/'
export const MESSAGE_ATTACHMENTS_PENDING_PREFIX = `${MESSAGE_ATTACHMENTS_PRIVATE_PREFIX}pending/`
export const MESSAGE_ATTACHMENTS_FINAL_PREFIX = `${MESSAGE_ATTACHMENTS_PRIVATE_PREFIX}final/`
export const MESSAGE_ATTACHMENTS_PUT_TTL_SECONDS = 300
// A signed GET is a bearer capability and cannot be revoked after issuance; keep its residual window short.
export const MESSAGE_ATTACHMENTS_GET_TTL_SECONDS = 60
export const MESSAGE_ATTACHMENTS_CONFIRM_TTL_MINUTES = 5
export const MESSAGE_ATTACHMENT_SIGNATURE_SAMPLE_BYTES = 64
export const MESSAGE_ATTACHMENT_PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0'

export type MessageAttachmentSignatureStatus =
  | 'verified'
  | 'rejected'
  | 'needs_deeper_inspection'
  | 'file_content_unverified'

export type PendingMessageAttachmentKey = Readonly<{
  kind: 'pending'
  key: string
  conversationId: string
  messageId: string
  userId: string
  pendingId: string
  fileName: string
}>

export type FinalMessageAttachmentKey = Readonly<{
  kind: 'final'
  key: string
  conversationId: string
  messageId: string
  userId: string
  objectId: string
  fileName: string
}>

export type LegacyMessageAttachmentKey = Readonly<{
  kind: 'legacy'
  key: string
  conversationId: string
  messageId: string
  attachmentId: string
  fileName: string
}>

export type StoredMessageAttachmentKey = FinalMessageAttachmentKey | LegacyMessageAttachmentKey

const safeStoredKeySegmentPattern = /^[\p{L}\p{N}._-]{1,160}$/u

export function getMessageAttachmentsBucketName() {
  return (
    process.env.R2_MESSAGE_ATTACHMENTS_BUCKET_NAME
    || process.env.R2_PRIVATE_BUCKET_NAME
    || process.env.R2_BUCKET_NAME
    || ''
  )
}

export function hasMessageAttachmentsR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && getMessageAttachmentsBucketName(),
  )
}

export function getMessageAttachmentsR2Client() {
  if (!hasMessageAttachmentsR2Config()) return null

  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  })
}

export function buildPendingMessageAttachmentKey(input: {
  conversationId: string
  messageId: string
  userId: string
  pendingId: string
  mediaType: MessageAttachmentMediaType
  fileName: string
}) {
  requireValidKeyInput(input)
  const key = `${MESSAGE_ATTACHMENTS_PENDING_PREFIX}${input.conversationId}/${input.messageId}/${input.userId}/${input.pendingId}/${input.fileName}`
  if (!parsePendingMessageAttachmentKey(key)) throw new Error('Invalid pending message attachment key.')
  return key
}

export function buildFinalMessageAttachmentKey(input: {
  conversationId: string
  messageId: string
  userId: string
  mediaType: MessageAttachmentMediaType
  fileName: string
  uuid?: () => string
}) {
  requireValidKeyInput(input)
  const objectId = input.uuid ? input.uuid() : randomUUID()
  if (!isValidUploadObjectId(objectId)) throw new Error('Invalid final message attachment object id.')

  const key = `${MESSAGE_ATTACHMENTS_FINAL_PREFIX}${input.conversationId}/${input.messageId}/${input.userId}/${objectId}/${input.fileName}`
  if (!parseFinalMessageAttachmentKey(key)) throw new Error('Invalid final message attachment key.')
  return key
}

export function parsePendingMessageAttachmentKey(value: unknown): PendingMessageAttachmentKey | null {
  const key = normalizeManagedKey(value)
  if (!key) return null
  const segments = key.split('/')
  if (segments.length !== 8 || segments[0] !== 'private' || segments[1] !== 'messages' || segments[2] !== 'pending') {
    return null
  }

  const [, , , conversationId, messageId, userId, pendingId, fileName] = segments
  if (!areUuidSegments([conversationId, messageId, userId, pendingId]) || !isSafeStoredKeySegment(fileName)) {
    return null
  }
  return { kind: 'pending', key, conversationId, messageId, userId, pendingId, fileName }
}

export function parseFinalMessageAttachmentKey(value: unknown): FinalMessageAttachmentKey | null {
  const key = normalizeManagedKey(value)
  if (!key) return null
  const segments = key.split('/')
  if (segments.length !== 8 || segments[0] !== 'private' || segments[1] !== 'messages' || segments[2] !== 'final') {
    return null
  }

  const [, , , conversationId, messageId, userId, objectId, fileName] = segments
  if (!areUuidSegments([conversationId, messageId, userId, objectId]) || !isSafeStoredKeySegment(fileName)) {
    return null
  }
  return { kind: 'final', key, conversationId, messageId, userId, objectId, fileName }
}

export function parseLegacyMessageAttachmentKey(value: unknown): LegacyMessageAttachmentKey | null {
  const key = normalizeManagedKey(value)
  if (!key) return null
  const segments = key.split('/')
  if (
    segments.length !== 6
    || segments[0] !== 'private'
    || segments[1] !== 'messages'
    || segments[2] === 'pending'
    || segments[2] === 'final'
  ) {
    return null
  }

  const [, , conversationId, messageId, attachmentId, fileName] = segments
  if (!areUuidSegments([conversationId, messageId, attachmentId]) || !isSafeStoredKeySegment(fileName)) {
    return null
  }
  return { kind: 'legacy', key, conversationId, messageId, attachmentId, fileName }
}

export function parseStoredMessageAttachmentKey(value: unknown): StoredMessageAttachmentKey | null {
  return parseFinalMessageAttachmentKey(value) || parseLegacyMessageAttachmentKey(value)
}

export function normalizePrivateMessageAttachmentKey(value: unknown) {
  return parseStoredMessageAttachmentKey(value)?.key ?? null
}

export function isSafePrivateMessageAttachmentKey(value: unknown): value is string {
  return normalizePrivateMessageAttachmentKey(value) !== null
}

export function isPrivateMessageAttachmentR2Reference(value: unknown) {
  if (typeof value !== 'string') return false
  const key = value.trim().startsWith('r2://') ? value.trim().slice('r2://'.length) : value.trim()
  return key.startsWith(MESSAGE_ATTACHMENTS_PRIVATE_PREFIX)
}

export function validatePendingMessageAttachmentKey(pending: PendingAttachmentRow) {
  const parsed = parsePendingMessageAttachmentKey(pending.storage_key)
  return parsed
    && parsed.conversationId === pending.conversation_id
    && parsed.messageId === pending.message_id
    && parsed.userId === pending.user_id
    && parsed.pendingId === pending.id
    && parsed.fileName === pending.file_name
    ? parsed
    : null
}

export function validateFinalMessageAttachmentKeyForPending(pending: PendingAttachmentRow) {
  const parsed = parseFinalMessageAttachmentKey(pending.final_storage_key)
  return parsed
    && parsed.conversationId === pending.conversation_id
    && parsed.messageId === pending.message_id
    && parsed.userId === pending.user_id
    && parsed.fileName === pending.file_name
    ? parsed
    : null
}

export function validateStoredMessageAttachmentKey(attachment: MessageAttachmentRow) {
  const parsed = parseStoredMessageAttachmentKey(attachment.storage_path)
  if (!parsed) return null

  if (parsed.kind === 'final') {
    return parsed.conversationId === attachment.conversation_id
      && parsed.messageId === attachment.message_id
      && parsed.userId === attachment.sender_id
      && parsed.fileName === attachment.file_name
      ? parsed
      : null
  }

  return parsed.conversationId === attachment.conversation_id
    && parsed.messageId === attachment.message_id
    && parsed.attachmentId === attachment.id
    ? parsed
    : null
}

export async function createMessageAttachmentPutUrl(input: {
  key: string
  contentType: string
  contentLength: number
}) {
  const client = requireR2Client('upload')
  const key = requirePendingKey(input.key)

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getMessageAttachmentsBucketName(),
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      CacheControl: MESSAGE_ATTACHMENT_PRIVATE_CACHE_CONTROL,
    }),
    { expiresIn: MESSAGE_ATTACHMENTS_PUT_TTL_SECONDS },
  )
}

export async function createMessageAttachmentGetUrl(input: {
  key: string
  contentType?: string | null
  fileName?: string | null
}) {
  const client = requireR2Client('download')
  const key = requireStoredKey(input.key)

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: getMessageAttachmentsBucketName(),
      Key: key,
      ResponseContentType: input.contentType || undefined,
      ResponseContentDisposition: input.fileName
        ? buildInlineContentDisposition(input.fileName)
        : undefined,
      ResponseCacheControl: MESSAGE_ATTACHMENT_PRIVATE_CACHE_CONTROL,
    }),
    { expiresIn: MESSAGE_ATTACHMENTS_GET_TTL_SECONDS },
  )
}

export async function headMessageAttachmentObject(key: string) {
  const client = requireR2Client('head')
  const safeKey = requireManagedKey(key)
  const output = await client.send(new HeadObjectCommand({
    Bucket: getMessageAttachmentsBucketName(),
    Key: safeKey,
  }))

  return normalizeHeadMetadata(output)
}

export async function readMessageAttachmentSignatureSample(
  key: string,
  byteCount = MESSAGE_ATTACHMENT_SIGNATURE_SAMPLE_BYTES,
) {
  const client = requireR2Client('sample read')
  const safeKey = requireManagedKey(key)
  const safeByteCount = Math.min(Math.max(Math.trunc(byteCount), 16), 4096)
  const output = await client.send(new GetObjectCommand({
    Bucket: getMessageAttachmentsBucketName(),
    Key: safeKey,
    Range: `bytes=0-${safeByteCount - 1}`,
  }))

  if (!output.Body) return new Uint8Array()
  return Uint8Array.from(await output.Body.transformToByteArray())
}

export async function copyPendingMessageAttachmentToFinal(input: {
  pendingKey: string
  finalKey: string
  contentType: string
  sourceEtag?: string | null
}) {
  const client = requireR2Client('copy')
  const pendingKey = requirePendingKey(input.pendingKey)
  const finalKey = requireFinalKey(input.finalKey)
  const bucket = getMessageAttachmentsBucketName()

  await client.send(new CopyObjectCommand({
    Bucket: bucket,
    Key: finalKey,
    CopySource: encodeCopySource(bucket, pendingKey),
    CopySourceIfMatch: input.sourceEtag || undefined,
    MetadataDirective: 'REPLACE',
    ContentType: input.contentType,
    CacheControl: MESSAGE_ATTACHMENT_PRIVATE_CACHE_CONTROL,
  }))
}

export async function deleteMessageAttachmentObject(key: string) {
  const client = requireR2Client('delete')
  const safeKey = requireManagedKey(key)
  await client.send(new DeleteObjectCommand({
    Bucket: getMessageAttachmentsBucketName(),
    Key: safeKey,
  }))
}

export function normalizeHeadMetadata(
  head: Pick<HeadObjectCommandOutput, 'ContentType' | 'ContentLength' | 'ETag'>,
) {
  return {
    contentType: normalizeDeclaredMime(head.ContentType) || '',
    contentLength: typeof head.ContentLength === 'number' && Number.isSafeInteger(head.ContentLength)
      ? head.ContentLength
      : null,
    etag: typeof head.ETag === 'string' && head.ETag ? head.ETag : null,
  }
}

export function classifyMessageAttachmentSignature(input: {
  mediaType: MessageAttachmentMediaType
  declaredMime: string
  sampleBytes: Uint8Array
}): MessageAttachmentSignatureStatus {
  const status = validateFileSignatureSample({
    bytes: input.sampleBytes,
    expectedMime: input.declaredMime,
    expectedKind: input.mediaType,
  })
  return status === 'unknown' ? 'file_content_unverified' : status
}

export function areMessageAttachmentMimesCompatible(declaredMime: string, detectedMime: string) {
  const declared = normalizeDeclaredMime(declaredMime)
  const detected = normalizeDeclaredMime(detectedMime)
  if (!declared || !detected) return false
  return declared === detected
    || (declared === 'audio/x-wav' && detected === 'audio/wav')
    || (declared === 'audio/wav' && detected === 'audio/x-wav')
}

export function isMissingR2ObjectError(error: unknown) {
  const value = error as {
    name?: string
    Code?: string
    $metadata?: { httpStatusCode?: number }
  } | null

  return (
    value?.name === 'NoSuchKey'
    || value?.Code === 'NoSuchKey'
    || value?.name === 'NotFound'
    || value?.$metadata?.httpStatusCode === 404
  )
}

function requireValidKeyInput(input: {
  conversationId: string
  messageId: string
  userId: string
  mediaType: MessageAttachmentMediaType
  fileName: string
}) {
  if (!areUuidSegments([input.conversationId, input.messageId, input.userId])) {
    throw new Error('Invalid private message attachment scope.')
  }
  const policy = getUploadPolicy(resolveMessageUploadContext(input.mediaType))
  if (!isValidUploadFileName(input.fileName, policy)) {
    throw new Error('Invalid private message attachment filename.')
  }
}

function resolveMessageUploadContext(mediaType: MessageAttachmentMediaType) {
  if (mediaType === 'image') return 'message_image' as const
  if (mediaType === 'video') return 'message_video' as const
  return 'message_audio' as const
}

function normalizeManagedKey(value: unknown) {
  if (typeof value !== 'string' || !value || value !== value.trim()) return null
  const key = value.startsWith('r2://') ? value.slice('r2://'.length) : value
  if (!key.startsWith(MESSAGE_ATTACHMENTS_PRIVATE_PREFIX)) return null
  if (/[\\\u0000-\u001f\u007f?#]/u.test(key) || key.includes('..')) return null
  return key.split('/').every(isSafeStoredKeySegment) ? key : null
}

function isSafeStoredKeySegment(value: string) {
  return safeStoredKeySegmentPattern.test(value) && value !== '.' && value !== '..' && !value.includes('..')
}

function areUuidSegments(values: readonly string[]) {
  return values.every(isValidUploadObjectId)
}

function requireR2Client(operation: string) {
  const client = getMessageAttachmentsR2Client()
  if (!client) throw new Error(`R2 ${operation} is unavailable.`)
  return client
}

function requirePendingKey(value: string) {
  const key = parsePendingMessageAttachmentKey(value)?.key
  if (!key) throw new Error('Invalid pending message attachment key.')
  return key
}

function requireFinalKey(value: string) {
  const key = parseFinalMessageAttachmentKey(value)?.key
  if (!key) throw new Error('Invalid final message attachment key.')
  return key
}

function requireStoredKey(value: string) {
  const key = parseStoredMessageAttachmentKey(value)?.key
  if (!key) throw new Error('Invalid stored message attachment key.')
  return key
}

function requireManagedKey(value: string) {
  return parsePendingMessageAttachmentKey(value)?.key || requireStoredKey(value)
}

function encodeCopySource(bucket: string, key: string) {
  return `/${[bucket, ...key.split('/')].map((segment) => encodeURIComponent(segment)).join('/')}`
}

function buildInlineContentDisposition(fileName: string) {
  const fallback = fileName
    .normalize('NFKC')
    .replace(/["\\\r\n\u0000-\u001f\u007f]/gu, '')
    .slice(0, 120) || 'arquivo'

  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fallback)}`
}
