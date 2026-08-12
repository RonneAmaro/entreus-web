import { GetObjectCommand } from '@aws-sdk/client-s3'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getSupabaseAdmin, jsonError, requireUser } from '@/lib/meet-server'
import { createRateLimiter, createRateLimitExceededResponse } from '@/lib/rate-limit'
import {
  PRIVATE_UPLOAD_RESPONSE_HEADERS,
  buildUploadObjectKey,
  getUploadPolicy,
  sanitizeUploadFileName,
  validateUploadMetadata,
  type UploadContext,
} from '@/lib/upload-security'
import {
  MESSAGE_ATTACHMENTS_CONFIRM_TTL_MINUTES,
  createMessageAttachmentGetUrl,
  createMessageAttachmentPutUrl,
  getMessageAttachmentsBucketName,
  getMessageAttachmentsR2Client,
  hasMessageAttachmentsR2Config,
  isSafePrivateMessageAttachmentKey,
} from './r2'

const SUPABASE_BUCKET_NAME = 'message-media'
const PREPARE_LIMITER = createRateLimiter({ limit: 20, windowMs: 60_000 })
const CONFIRM_LIMITER = createRateLimiter({ limit: 30, windowMs: 60_000 })

export type MessageAttachmentMediaType = 'image' | 'video' | 'audio'

export type MessageAttachmentPrepareBody = {
  conversationId?: unknown
  messageId?: unknown
  filename?: unknown
  declaredMime?: unknown
  declaredSize?: unknown
  mediaType?: unknown
  position?: unknown
}

export type PendingAttachmentRow = {
  id: string
  user_id: string
  conversation_id: string
  message_id: string
  storage_provider: string
  storage_bucket: string
  storage_key: string
  media_type: MessageAttachmentMediaType
  declared_mime: string
  declared_size: number
  file_name: string
  position: number
  status: string
  expires_at: string
  confirmed_at: string | null
}

export type MessageAttachmentRow = {
  id: string
  conversation_id: string
  message_id: string
  sender_id: string
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  media_type: MessageAttachmentMediaType
  file_size: number | null
  needs_deeper_inspection?: boolean | null
  file_content_unverified?: boolean | null
}

export type MessageAttachmentAccess =
  | { error: Response }
  | {
      auth: { user: User }
      supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>
    }

export function jsonNoStore(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      ...PRIVATE_UPLOAD_RESPONSE_HEADERS,
      ...(headers || {}),
    },
  })
}

function getRateLimitIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown'
}

export async function requireMessageAttachmentAuth(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return { error: auth.error }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { error: jsonError('Configuracao Supabase ausente no servidor.', 500) }

  return { auth: { user: auth.user }, supabase } satisfies MessageAttachmentAccess
}

export async function requireConversationParticipant(input: {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>> | SupabaseClient
  conversationId: string
  userId: string
}) {
  const { data, error } = await input.supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (error) throw new Error('Conversation participant lookup failed.')
  return Boolean(data)
}

export async function requireOwnedMessage(input: {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>> | SupabaseClient
  conversationId: string
  messageId: string
  userId: string
}) {
  const { data, error } = await input.supabase
    .from('messages')
    .select('id, conversation_id, sender_id')
    .eq('id', input.messageId)
    .eq('conversation_id', input.conversationId)
    .maybeSingle()

  if (error) throw new Error('Message lookup failed.')
  return Boolean(data && data.sender_id === input.userId)
}

export function resolveMessageUploadContext(mediaType: MessageAttachmentMediaType): UploadContext {
  if (mediaType === 'image') return 'message_image'
  if (mediaType === 'video') return 'message_video'
  return 'message_audio'
}

export function parseMessageAttachmentMediaType(value: unknown): MessageAttachmentMediaType | null {
  return value === 'image' || value === 'video' || value === 'audio' ? value : null
}

export function parseMessageAttachmentPosition(value: unknown) {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 2
    ? value as number
    : null
}

export async function parsePrepareRequest(request: Request) {
  let body: MessageAttachmentPrepareBody

  try {
    body = (await request.json()) as MessageAttachmentPrepareBody
  } catch {
    return { error: jsonNoStore({ ok: false, error: 'INVALID_JSON' }, 400) }
  }

  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
  const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : ''
  const fileName = typeof body.filename === 'string' ? body.filename.trim() : ''
  const mediaType = parseMessageAttachmentMediaType(body.mediaType)
  const position = parseMessageAttachmentPosition(body.position)

  if (!conversationId || !messageId || !fileName || !mediaType || position === null) {
    return { error: jsonNoStore({ ok: false, error: 'INVALID_PAYLOAD' }, 400) }
  }

  const policy = getUploadPolicy(resolveMessageUploadContext(mediaType))
  const validation = validateUploadMetadata({
    context: policy.context,
    fileName,
    declaredMime: body.declaredMime,
    declaredSize: body.declaredSize,
    policy,
  })

  if (!validation.ok) {
    return { error: jsonNoStore({ ok: false, error: validation.code }, validation.code === 'file_too_large' ? 413 : 400) }
  }

  return {
    body: {
      conversationId,
      messageId,
      fileName: sanitizeUploadFileName(fileName, policy) as string,
      declaredMime: validation.mime,
      declaredSize: body.declaredSize as number,
      mediaType,
      position,
    },
  }
}

export async function enforcePrepareRateLimit(request: Request, userId: string) {
  const result = await PREPARE_LIMITER.check({
    key: `${userId}:${getRateLimitIp(request)}:message-attachment-prepare`,
  })
  return result.ok ? null : createRateLimitExceededResponse(result, { ok: false, error: 'RATE_LIMITED' })
}

export async function enforceConfirmRateLimit(request: Request, userId: string) {
  const result = await CONFIRM_LIMITER.check({
    key: `${userId}:${getRateLimitIp(request)}:message-attachment-confirm`,
  })
  return result.ok ? null : createRateLimitExceededResponse(result, { ok: false, error: 'RATE_LIMITED' })
}

export async function createPendingMessageAttachment(input: {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>
  userId: string
  conversationId: string
  messageId: string
  mediaType: MessageAttachmentMediaType
  fileName: string
  declaredMime: string
  declaredSize: number
  position: number
}) {
  if (!hasMessageAttachmentsR2Config()) {
    throw new Error('Private R2 configuration is unavailable.')
  }

  const leafKey = buildUploadObjectKey({
    area: input.userId,
    ownerId: crypto.randomUUID(),
    fileName: input.fileName,
    policy: getUploadPolicy(resolveMessageUploadContext(input.mediaType)),
  })
  const storageKey = `private/messages/${input.conversationId}/${input.messageId}/${leafKey}`

  if (!isSafePrivateMessageAttachmentKey(storageKey)) {
    throw new Error('Unsafe object key.')
  }

  const expiresAt = new Date(Date.now() + MESSAGE_ATTACHMENTS_CONFIRM_TTL_MINUTES * 60_000).toISOString()
  const { data, error } = await input.supabase
    .from('private_message_attachment_uploads')
    .insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      message_id: input.messageId,
      storage_provider: 'cloudflare-r2',
      storage_bucket: getMessageAttachmentsBucketName(),
      storage_key: storageKey,
      media_type: input.mediaType,
      file_name: input.fileName,
      declared_mime: input.declaredMime,
      declared_size: input.declaredSize,
      position: input.position,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error('Pending upload could not be created.')
  }

  const uploadUrl = await createMessageAttachmentPutUrl({
    key: storageKey,
    contentType: input.declaredMime,
    contentLength: input.declaredSize,
  })

  return {
    pending: data as PendingAttachmentRow,
    uploadUrl,
    expiresAt,
  }
}

export async function loadPendingMessageAttachment(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, pendingId: string) {
  const { data, error } = await supabase
    .from('private_message_attachment_uploads')
    .select('*')
    .eq('id', pendingId)
    .maybeSingle()

  if (error) throw new Error('Pending upload lookup failed.')
  return (data as PendingAttachmentRow | null) || null
}

export function parseSupabaseStorageReference(value: string) {
  const raw = value.trim()

  try {
    const parsed = new URL(raw)
    const pathname = decodeURIComponent(parsed.pathname)
    const marker = '/storage/v1/object/'
    const markerIndex = pathname.indexOf(marker)
    if (markerIndex === -1) return null
    const segments = pathname.slice(markerIndex + marker.length).split('/').filter(Boolean)
    if (segments.length < 3) return null
    segments.shift()
    const bucket = segments.shift()
    const objectPath = segments.join('/')
    if (bucket !== SUPABASE_BUCKET_NAME || !objectPath || objectPath.includes('..') || objectPath.includes('\\')) return null
    return { bucket, objectPath }
  } catch {
    if (!raw || raw.includes('..') || raw.includes('\\')) return null
    return { bucket: SUPABASE_BUCKET_NAME, objectPath: raw.replace(/^\/+/, '') }
  }
}

export async function createAuthorizedAttachmentDownload(input: {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>
  attachment: MessageAttachmentRow
}) {
  if (!input.attachment.storage_path) throw new Error('Attachment storage path is missing.')

  if (isSafePrivateMessageAttachmentKey(input.attachment.storage_path)) {
    const url = await createMessageAttachmentGetUrl({
      key: input.attachment.storage_path,
      contentType: input.attachment.mime_type,
      fileName: input.attachment.file_name,
    })

    return { provider: 'cloudflare-r2', url, expiresIn: 300 }
  }

  const legacy = parseSupabaseStorageReference(input.attachment.storage_path)
  if (!legacy) throw new Error('Invalid attachment storage reference.')

  const { data, error } = await input.supabase.storage
    .from(legacy.bucket)
    .createSignedUrl(legacy.objectPath, 300)

  if (error || !data?.signedUrl) {
    throw new Error('Signed download could not be created.')
  }

  return { provider: 'supabase-storage', url: data.signedUrl, expiresIn: 300 }
}

export async function readMessageAttachmentSignatureSample(key: string, byteCount = 64) {
  const client = getMessageAttachmentsR2Client()
  const bucket = getMessageAttachmentsBucketName()
  if (!client || !bucket || !isSafePrivateMessageAttachmentKey(key)) {
    throw new Error('R2 sample read is unavailable.')
  }

  const output = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: `bytes=0-${Math.max(0, byteCount - 1)}`,
    }),
  )

  if (!output.Body) return new Uint8Array()
  const bytes = await output.Body.transformToByteArray()
  return bytes
}
