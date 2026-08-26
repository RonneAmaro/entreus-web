import type { SupabaseClient, User } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin, requireUser } from '@/lib/meet-server'
import { createRateLimiter, createRateLimitExceededResponse } from '@/lib/rate-limit'
import {
  PRIVATE_UPLOAD_RESPONSE_HEADERS,
  getUploadPolicy,
  isValidUploadObjectId,
  sanitizeUploadFileName,
  validateUploadMetadata,
  type UploadContext,
} from '@/lib/upload-security'
import {
  MESSAGE_ATTACHMENTS_CONFIRM_TTL_MINUTES,
  MESSAGE_ATTACHMENTS_GET_TTL_SECONDS,
  MESSAGE_ATTACHMENTS_PUT_TTL_SECONDS,
  buildFinalMessageAttachmentKey,
  buildPendingMessageAttachmentKey,
  createMessageAttachmentGetUrl,
  createMessageAttachmentPutUrl,
  getMessageAttachmentsBucketName,
  hasMessageAttachmentsR2Config,
  isPrivateMessageAttachmentR2Reference,
  validateStoredMessageAttachmentKey,
} from './r2'

const SUPABASE_MESSAGE_ATTACHMENTS_BUCKET = 'message-media'
const PREPARE_LIMITER = createRateLimiter({ limit: 20, windowMs: 60_000 })
const CONFIRM_LIMITER = createRateLimiter({ limit: 30, windowMs: 60_000 })

export type MessageAttachmentMediaType = 'image' | 'video' | 'audio'
export type PendingMessageAttachmentStatus = 'pending' | 'confirming' | 'confirmed' | 'cleanup_required'

export type MessageAttachmentPrepareBody = Readonly<{
  conversationId?: unknown
  messageId?: unknown
  filename?: unknown
  declaredMime?: unknown
  declaredSize?: unknown
  mediaType?: unknown
  position?: unknown
}>

export type PreparedMessageAttachment = Readonly<{
  conversationId: string
  messageId: string
  fileName: string
  declaredMime: string
  declaredSize: number
  mediaType: MessageAttachmentMediaType
  position: number
}>

export type PendingAttachmentRow = Readonly<{
  id: string
  user_id: string
  conversation_id: string
  message_id: string
  storage_provider: 'cloudflare-r2'
  storage_bucket: string
  storage_key: string
  final_storage_key: string | null
  attachment_id: string | null
  media_type: MessageAttachmentMediaType
  file_name: string
  declared_mime: string
  declared_size: number
  position: number
  status: PendingMessageAttachmentStatus
  expires_at: string
  confirmed_at: string | null
  created_at: string
}>

export type MessageAttachmentRow = Readonly<{
  id: string
  conversation_id: string
  message_id: string
  sender_id: string
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  media_type: MessageAttachmentMediaType
  file_size: number | null
  position: number
  created_at?: string
  needs_deeper_inspection?: boolean | null
}>

export type MessageAttachmentAccess =
  | { error: Response }
  | {
      auth: { user: User }
      supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>
    }

export type MessageAttachmentPrepareParseResult =
  | { error: Response }
  | { body: PreparedMessageAttachment }

export class MessageAttachmentServerError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code)
    this.name = 'MessageAttachmentServerError'
  }
}

export function jsonNoStore(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: {
      ...PRIVATE_UPLOAD_RESPONSE_HEADERS,
      Vary: 'Authorization, Cookie',
      ...(headers || {}),
    },
  })
}

export function withPrivateNoStore(response: Response) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(PRIVATE_UPLOAD_RESPONSE_HEADERS)) {
    headers.set(name, value)
  }
  headers.set('Vary', 'Authorization, Cookie')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function requireMessageAttachmentAuth(request: Request): Promise<MessageAttachmentAccess> {
  const auth = await requireUser(request)
  if ('error' in auth) {
    return {
      error: auth.error
        ? withPrivateNoStore(auth.error)
        : jsonNoStore({ ok: false, error: 'UNAUTHORIZED' }, 401),
    }
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return {
      error: jsonNoStore({ ok: false, error: 'SERVER_AUTH_CONFIG_MISSING' }, 500),
    }
  }

  return { auth: { user: auth.user }, supabase }
}

export async function requireConversationParticipant(input: {
  supabase: SupabaseClient
  conversationId: string
  userId: string
}) {
  const { data, error } = await input.supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('conversation_id', input.conversationId)
    .eq('user_id', input.userId)
    .maybeSingle()

  if (error) throw new MessageAttachmentServerError('PARTICIPATION_LOOKUP_FAILED', 500)
  return Boolean(data)
}

export async function requireOwnedMessage(input: {
  supabase: SupabaseClient
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

  if (error) throw new MessageAttachmentServerError('MESSAGE_LOOKUP_FAILED', 500)
  return Boolean(data && data.sender_id === input.userId)
}

export async function loadMessageForAttachmentAccess(input: {
  supabase: SupabaseClient
  messageId: string
}) {
  const { data, error } = await input.supabase
    .from('messages')
    .select('id, conversation_id, sender_id')
    .eq('id', input.messageId)
    .maybeSingle()

  if (error) throw new MessageAttachmentServerError('MESSAGE_LOOKUP_FAILED', 500)
  return data as { id: string; conversation_id: string; sender_id: string } | null
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

export async function parsePrepareRequest(request: Request): Promise<MessageAttachmentPrepareParseResult> {
  let body: MessageAttachmentPrepareBody
  try {
    body = (await request.json()) as MessageAttachmentPrepareBody
  } catch {
    return { error: jsonNoStore({ ok: false, error: 'INVALID_JSON' }, 400) }
  }

  const conversationId = parseUuid(body.conversationId)
  const messageId = parseUuid(body.messageId)
  const fileName = typeof body.filename === 'string' ? body.filename.trim() : ''
  const mediaType = parseMessageAttachmentMediaType(body.mediaType)
  const position = parseMessageAttachmentPosition(body.position)

  if (!conversationId || !messageId || !fileName || !mediaType || position === null) {
    return { error: jsonNoStore({ ok: false, error: 'INVALID_PAYLOAD' }, 400) }
  }

  const context = resolveMessageUploadContext(mediaType)
  const policy = getUploadPolicy(context)
  const validation = validateUploadMetadata({
    context,
    fileName,
    declaredMime: body.declaredMime,
    declaredSize: body.declaredSize,
  })

  if (!validation.ok) {
    return {
      error: jsonNoStore(
        { ok: false, error: validation.code },
        validation.code === 'file_too_large' ? 413 : 400,
      ),
    }
  }

  const safeFileName = sanitizeUploadFileName(fileName, policy)
  if (!safeFileName) {
    return { error: jsonNoStore({ ok: false, error: 'file_name_invalid' }, 400) }
  }

  return {
    body: {
      conversationId,
      messageId,
      fileName: safeFileName,
      declaredMime: validation.mime,
      declaredSize: body.declaredSize as number,
      mediaType,
      position,
    } satisfies PreparedMessageAttachment,
  }
}

export function parseUuid(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return isValidUploadObjectId(normalized) ? normalized : null
}

export async function enforcePrepareRateLimit(_request: Request, userId: string) {
  const result = await PREPARE_LIMITER.check({
    key: `${userId}:message-attachment-prepare`,
  })
  return result.ok
    ? null
    : withPrivateNoStore(createRateLimitExceededResponse(result, { ok: false, error: 'RATE_LIMITED' }))
}

export async function enforceConfirmRateLimit(_request: Request, userId: string) {
  const result = await CONFIRM_LIMITER.check({
    key: `${userId}:message-attachment-confirm`,
  })
  return result.ok
    ? null
    : withPrivateNoStore(createRateLimitExceededResponse(result, { ok: false, error: 'RATE_LIMITED' }))
}

export async function createPendingMessageAttachment(input: {
  supabase: SupabaseClient
  userId: string
  prepared: PreparedMessageAttachment
}) {
  if (!hasMessageAttachmentsR2Config()) {
    throw new MessageAttachmentServerError('R2_CONFIG_MISSING', 503)
  }

  const now = new Date()
  const expiresAt = new Date(
    now.getTime() + MESSAGE_ATTACHMENTS_CONFIRM_TTL_MINUTES * 60_000,
  ).toISOString()
  for (const status of ['pending', 'confirming'] as const) {
    const expiredResult = await input.supabase
      .from('private_message_attachment_uploads')
      .update({ status: 'cleanup_required', confirmed_at: null, attachment_id: null })
      .eq('user_id', input.userId)
      .eq('message_id', input.prepared.messageId)
      .eq('position', input.prepared.position)
      .eq('status', status)
      .lt('expires_at', now.toISOString())

    if (expiredResult.error) {
      throw new MessageAttachmentServerError('PENDING_CLEANUP_FAILED', 500)
    }
  }

  const pendingId = randomUUID()
  const storageKey = buildPendingMessageAttachmentKey({
    conversationId: input.prepared.conversationId,
    messageId: input.prepared.messageId,
    userId: input.userId,
    pendingId,
    mediaType: input.prepared.mediaType,
    fileName: input.prepared.fileName,
  })
  const { data, error } = await input.supabase
    .from('private_message_attachment_uploads')
    .insert({
      id: pendingId,
      user_id: input.userId,
      conversation_id: input.prepared.conversationId,
      message_id: input.prepared.messageId,
      storage_provider: 'cloudflare-r2',
      storage_bucket: getMessageAttachmentsBucketName(),
      storage_key: storageKey,
      final_storage_key: null,
      attachment_id: null,
      media_type: input.prepared.mediaType,
      file_name: input.prepared.fileName,
      declared_mime: input.prepared.declaredMime,
      declared_size: input.prepared.declaredSize,
      position: input.prepared.position,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new MessageAttachmentServerError('PENDING_CREATE_FAILED', 409)
  }

  try {
    const uploadUrl = await createMessageAttachmentPutUrl({
      key: storageKey,
      contentType: input.prepared.declaredMime,
      contentLength: input.prepared.declaredSize,
    })
    return {
      pending: data as PendingAttachmentRow,
      uploadUrl,
      expiresAt,
      expiresIn: MESSAGE_ATTACHMENTS_PUT_TTL_SECONDS,
    }
  } catch {
    await markPendingMessageAttachment(input.supabase, data.id, 'cleanup_required')
    throw new MessageAttachmentServerError('UPLOAD_URL_CREATE_FAILED', 502)
  }
}

export async function loadPendingMessageAttachment(
  supabase: SupabaseClient,
  pendingId: string,
) {
  const { data, error } = await supabase
    .from('private_message_attachment_uploads')
    .select('*')
    .eq('id', pendingId)
    .maybeSingle()

  if (error) throw new MessageAttachmentServerError('PENDING_LOOKUP_FAILED', 500)
  return data as PendingAttachmentRow | null
}

export async function markPendingMessageAttachment(
  supabase: SupabaseClient,
  pendingId: string,
  status: 'confirmed' | 'cleanup_required',
  attachmentId?: string,
) {
  const values = status === 'confirmed'
    ? { status, confirmed_at: new Date().toISOString(), attachment_id: attachmentId || null }
    : { status, confirmed_at: null, attachment_id: null }
  const { error } = await supabase
    .from('private_message_attachment_uploads')
    .update(values)
    .eq('id', pendingId)

  if (error) throw new MessageAttachmentServerError('PENDING_UPDATE_FAILED', 500)
}

export async function claimPendingMessageAttachment(
  supabase: SupabaseClient,
  pending: PendingAttachmentRow,
) {
  const finalStorageKey = buildFinalMessageAttachmentKey({
    conversationId: pending.conversation_id,
    messageId: pending.message_id,
    userId: pending.user_id,
    mediaType: pending.media_type,
    fileName: pending.file_name,
  })
  const { data, error } = await supabase
    .from('private_message_attachment_uploads')
    .update({ status: 'confirming', final_storage_key: finalStorageKey })
    .eq('id', pending.id)
    .eq('user_id', pending.user_id)
    .eq('status', 'pending')
    .is('final_storage_key', null)
    .select('*')
    .maybeSingle()

  if (error) throw new MessageAttachmentServerError('PENDING_CLAIM_FAILED', 500)
  return data as PendingAttachmentRow | null
}

export function validatePendingMessageAttachmentMetadata(pending: PendingAttachmentRow) {
  const mediaType = parseMessageAttachmentMediaType(pending.media_type)
  const position = parseMessageAttachmentPosition(pending.position)
  if (!mediaType || position === null) return false

  const validation = validateUploadMetadata({
    context: resolveMessageUploadContext(mediaType),
    fileName: pending.file_name,
    declaredMime: pending.declared_mime,
    declaredSize: pending.declared_size,
  })
  return validation.ok
}

export async function loadAttachmentByStorageKey(input: {
  supabase: SupabaseClient
  pending: PendingAttachmentRow
}) {
  if (!input.pending.final_storage_key) return null
  const { data, error } = await input.supabase
    .from('message_attachments')
    .select(attachmentSelect())
    .eq('message_id', input.pending.message_id)
    .eq('sender_id', input.pending.user_id)
    .eq('storage_path', input.pending.final_storage_key)
    .maybeSingle()

  if (error) throw new MessageAttachmentServerError('ATTACHMENT_LOOKUP_FAILED', 500)
  return data as unknown as MessageAttachmentRow | null
}

export async function createConfirmedMessageAttachment(input: {
  supabase: SupabaseClient
  pending: PendingAttachmentRow
  needsDeeperInspection: boolean
}) {
  if (!input.pending.final_storage_key) {
    throw new MessageAttachmentServerError('FINAL_STORAGE_KEY_MISSING', 409)
  }
  const existing = await loadAttachmentByStorageKey(input)
  if (existing) return { attachment: existing, alreadyConfirmed: true }

  const { data, error } = await input.supabase
    .from('message_attachments')
    .insert({
      message_id: input.pending.message_id,
      conversation_id: input.pending.conversation_id,
      sender_id: input.pending.user_id,
      storage_path: input.pending.final_storage_key,
      media_type: input.pending.media_type,
      file_name: input.pending.file_name,
      file_size: input.pending.declared_size,
      mime_type: input.pending.declared_mime,
      position: input.pending.position,
      needs_deeper_inspection: input.needsDeeperInspection,
    })
    .select(attachmentSelect())
    .single()

  if (!error && data) {
    return { attachment: data as unknown as MessageAttachmentRow, alreadyConfirmed: false }
  }

  // A concurrent confirmation may have won the unique storage-key insert.
  const concurrent = await loadAttachmentByStorageKey(input)
  if (concurrent) return { attachment: concurrent, alreadyConfirmed: true }

  throw new MessageAttachmentServerError('ATTACHMENT_INSERT_FAILED', 500)
}

export async function hasMessageAttachmentAtPosition(input: {
  supabase: SupabaseClient
  messageId: string
  position: number
}) {
  const { data, error } = await input.supabase
    .from('message_attachments')
    .select('id')
    .eq('message_id', input.messageId)
    .eq('position', input.position)

  if (error) throw new MessageAttachmentServerError('ATTACHMENT_POSITION_LOOKUP_FAILED', 500)
  return Array.isArray(data) ? data.length > 0 : Boolean(data)
}

export async function loadMessageAttachment(input: {
  supabase: SupabaseClient
  attachmentId: string
}) {
  const { data, error } = await input.supabase
    .from('message_attachments')
    .select(attachmentSelect())
    .eq('id', input.attachmentId)
    .maybeSingle()

  if (error) throw new MessageAttachmentServerError('ATTACHMENT_LOOKUP_FAILED', 500)
  return data as unknown as MessageAttachmentRow | null
}

export async function listMessageAttachments(input: {
  supabase: SupabaseClient
  messageId: string
}) {
  const { data, error } = await input.supabase
    .from('message_attachments')
    .select('id, message_id, conversation_id, sender_id, media_type, file_name, file_size, mime_type, position, needs_deeper_inspection, created_at')
    .eq('message_id', input.messageId)
    .order('position', { ascending: true })

  if (error) throw new MessageAttachmentServerError('ATTACHMENT_LIST_FAILED', 500)
  return data || []
}

export function publicMessageAttachment(attachment: MessageAttachmentRow) {
  return {
    id: attachment.id,
    message_id: attachment.message_id,
    conversation_id: attachment.conversation_id,
    sender_id: attachment.sender_id,
    media_type: attachment.media_type,
    file_name: attachment.file_name,
    file_size: attachment.file_size,
    mime_type: attachment.mime_type,
    position: attachment.position,
    needs_deeper_inspection: Boolean(attachment.needs_deeper_inspection),
    created_at: attachment.created_at,
  }
}

export function parseSupabaseStorageReference(value: unknown) {
  if (typeof value !== 'string' || !value || value !== value.trim()) return null
  if (/[\u0000-\u001f\u007f?#]/u.test(value)) return null

  if (!looksLikeAbsoluteUrl(value)) {
    const objectPath = value.replace(/^\/+/, '')
    return isSafeLegacyObjectPath(objectPath)
      ? { bucket: SUPABASE_MESSAGE_ATTACHMENTS_BUCKET, objectPath }
      : null
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    const configuredOrigin = getConfiguredSupabaseOrigin()
    if (!configuredOrigin || parsed.origin !== configuredOrigin) return null
    const pathname = decodeURIComponent(parsed.pathname)
    const marker = '/storage/v1/object/'
    const markerIndex = pathname.indexOf(marker)
    if (markerIndex === -1) return null

    const segments = pathname.slice(markerIndex + marker.length).split('/').filter(Boolean)
    if (segments.length < 3) return null
    const action = segments.shift()
    if (action !== 'sign' && action !== 'public' && action !== 'authenticated') return null
    const bucket = segments.shift()
    const objectPath = segments.join('/')

    return bucket === SUPABASE_MESSAGE_ATTACHMENTS_BUCKET && isSafeLegacyObjectPath(objectPath)
      ? { bucket, objectPath }
      : null
  } catch {
    return null
  }
}

export function validateSupabaseStorageReferenceForAttachment(
  attachment: MessageAttachmentRow,
  options: { requireSenderBinding: boolean },
) {
  const reference = parseSupabaseStorageReference(attachment.storage_path)
  if (!reference) return null
  const segments = reference.objectPath.split('/')
  if (segments[0] !== attachment.conversation_id) return null

  const currentUiFileName = segments.slice(2).join('/')
  const hasCurrentUiScope = segments[1] === attachment.sender_id
    && currentUiFileName.startsWith(`message-${attachment.message_id}-`)
  if (hasCurrentUiScope) return reference

  // Older conversation/message paths prove participant download scope, but not sender ownership.
  if (!options.requireSenderBinding && segments[1] === attachment.message_id) return reference
  return null
}

export async function createAuthorizedAttachmentDownload(input: {
  supabase: SupabaseClient
  attachment: MessageAttachmentRow
}) {
  if (!input.attachment.storage_path) {
    throw new MessageAttachmentServerError('INVALID_STORAGE_PATH', 400)
  }

  const privateKey = validateStoredMessageAttachmentKey(input.attachment)
  if (privateKey) {
    const url = await createMessageAttachmentGetUrl({
      key: privateKey.key,
      contentType: input.attachment.mime_type,
      fileName: input.attachment.file_name,
    })
    return {
      provider: 'cloudflare-r2' as const,
      url,
      expiresIn: MESSAGE_ATTACHMENTS_GET_TTL_SECONDS,
    }
  }

  if (isPrivateMessageAttachmentR2Reference(input.attachment.storage_path)) {
    throw new MessageAttachmentServerError('INVALID_STORAGE_SCOPE', 400)
  }

  const legacy = validateSupabaseStorageReferenceForAttachment(input.attachment, {
    requireSenderBinding: false,
  })
  if (!legacy) throw new MessageAttachmentServerError('INVALID_STORAGE_PATH', 400)

  const { data, error } = await input.supabase.storage
    .from(legacy.bucket)
    .createSignedUrl(legacy.objectPath, MESSAGE_ATTACHMENTS_GET_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    throw new MessageAttachmentServerError('DOWNLOAD_URL_CREATE_FAILED', 500)
  }

  return {
    provider: 'supabase-storage' as const,
    url: data.signedUrl,
    expiresIn: MESSAGE_ATTACHMENTS_GET_TTL_SECONDS,
  }
}

export function responseForMessageAttachmentError(error: unknown, fallbackCode: string) {
  if (error instanceof MessageAttachmentServerError) {
    return jsonNoStore({ ok: false, error: error.code }, error.status)
  }
  return jsonNoStore({ ok: false, error: fallbackCode }, 500)
}

function looksLikeAbsoluteUrl(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(value)
}

function getConfiguredSupabaseOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin
  } catch {
    return null
  }
}

function isSafeLegacyObjectPath(value: string) {
  if (!value || value.startsWith('/') || /[\\\u0000-\u001f\u007f?#]/u.test(value)) return false
  const segments = value.split('/')
  return segments.every((segment) => segment && segment !== '.' && segment !== '..' && !segment.includes('..'))
}

function attachmentSelect() {
  return 'id, message_id, conversation_id, sender_id, storage_path, media_type, file_name, file_size, mime_type, position, needs_deeper_inspection, created_at'
}
