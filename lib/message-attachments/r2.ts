import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { detectFileSignature } from '@/lib/upload-security'

export const MESSAGE_ATTACHMENTS_PRIVATE_PREFIX = 'private/messages/'
export const MESSAGE_ATTACHMENTS_PRESIGN_TTL_SECONDS = 300
export const MESSAGE_ATTACHMENTS_CONFIRM_TTL_MINUTES = 5

export type MessageAttachmentSignatureStatus =
  | 'verified'
  | 'rejected'
  | 'needs_deeper_inspection'
  | 'file_content_unverified'

export function getMessageAttachmentsBucketName() {
  return (
    process.env.R2_MESSAGE_ATTACHMENTS_BUCKET_NAME ||
    process.env.R2_PRIVATE_BUCKET_NAME ||
    process.env.R2_BUCKET_NAME ||
    ''
  )
}

export function hasMessageAttachmentsR2Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      getMessageAttachmentsBucketName(),
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

function isSafeKeySegment(value: string) {
  return /^[\p{L}\p{N}._-]{1,120}$/u.test(value) && value !== '.' && value !== '..'
}

export function buildPrivateMessageAttachmentKey(input: {
  conversationId: string
  messageId: string
  userId: string
  fileName: string
}) {
  const safeName = input.fileName.trim()
  if (!safeName) throw new Error('Invalid file name.')
  if (!isSafeKeySegment(input.conversationId) || !isSafeKeySegment(input.messageId) || !isSafeKeySegment(input.userId)) {
    throw new Error('Invalid private message attachment key.')
  }

  return `${MESSAGE_ATTACHMENTS_PRIVATE_PREFIX}${input.conversationId}/${input.messageId}/${input.userId}/${crypto.randomUUID()}/${safeName}`
}

export function isSafePrivateMessageAttachmentKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(MESSAGE_ATTACHMENTS_PRIVATE_PREFIX) &&
    !/[\\\0?#]/.test(value) &&
    !value.includes('..')
  )
}

export async function createMessageAttachmentPutUrl(input: {
  key: string
  contentType: string
  contentLength: number
}) {
  const client = getMessageAttachmentsR2Client()
  const bucket = getMessageAttachmentsBucketName()
  if (!client || !bucket || !isSafePrivateMessageAttachmentKey(input.key)) {
    throw new Error('R2 upload is unavailable.')
  }

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }),
    { expiresIn: MESSAGE_ATTACHMENTS_PRESIGN_TTL_SECONDS },
  )
}

export async function headMessageAttachmentObject(key: string) {
  const client = getMessageAttachmentsR2Client()
  const bucket = getMessageAttachmentsBucketName()
  if (!client || !bucket || !isSafePrivateMessageAttachmentKey(key)) {
    throw new Error('R2 head is unavailable.')
  }

  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
}

export async function deleteMessageAttachmentObject(key: string) {
  const client = getMessageAttachmentsR2Client()
  const bucket = getMessageAttachmentsBucketName()
  if (!client || !bucket || !isSafePrivateMessageAttachmentKey(key)) {
    throw new Error('R2 delete is unavailable.')
  }

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export async function createMessageAttachmentGetUrl(input: {
  key: string
  contentType?: string | null
  fileName?: string | null
}) {
  const client = getMessageAttachmentsR2Client()
  const bucket = getMessageAttachmentsBucketName()
  if (!client || !bucket || !isSafePrivateMessageAttachmentKey(input.key)) {
    throw new Error('R2 download is unavailable.')
  }

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ResponseContentType: input.contentType || undefined,
      ResponseContentDisposition: input.fileName
        ? `inline; filename="${input.fileName.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(input.fileName)}`
        : undefined,
    }),
    { expiresIn: MESSAGE_ATTACHMENTS_PRESIGN_TTL_SECONDS },
  )
}

export function isMissingR2ObjectError(error: unknown) {
  const value = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } } | null
  if (value?.name === 'NoSuchKey' || value?.Code === 'NoSuchKey') return true
  if (value?.name !== 'NotFound') return false
  return !value.Code || value.Code === 'NotFound' || value.Code === 'NoSuchKey'
}

export function classifyMessageAttachmentSignature(params: {
  mediaType: 'image' | 'video' | 'audio'
  declaredMime: string
  sampleBytes: Uint8Array
}): MessageAttachmentSignatureStatus {
  const signature = detectFileSignature(params.sampleBytes)

  if (signature.confidence === 'needs_deeper_inspection') {
    return 'needs_deeper_inspection'
  }

  if (signature.confidence === 'high') {
    const declaredMime = params.declaredMime.trim().toLowerCase()
    return signature.kind === params.mediaType && signature.detectedMime === declaredMime
      ? 'verified'
      : 'rejected'
  }

  return 'file_content_unverified'
}

export function normalizeHeadMetadata(head: Pick<HeadObjectCommandOutput, 'ContentType' | 'ContentLength'>) {
  return {
    contentType: (head.ContentType || '').split(';', 1)[0].trim().toLowerCase(),
    contentLength: typeof head.ContentLength === 'number' ? head.ContentLength : null,
  }
}
