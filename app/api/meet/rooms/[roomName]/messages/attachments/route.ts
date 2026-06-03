import {
  canJoinRoom,
  expireRoomIfNeeded,
  getMembership,
  getRoomByName,
  getSupabaseAdmin,
  hasRoomExpired,
  jsonError,
  requireUser,
} from '@/lib/meet-server'
import { NextResponse } from 'next/server'

const BUCKET_NAME = 'meet-chat-attachments'
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024

const ALLOWED_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'msi',
  'apk',
  'js',
  'html',
  'htm',
  'php',
  'sh',
  'zip',
  'rar',
  '7z',
])

type AttachmentsRouteContext = {
  params: Promise<{ roomName: string }>
}

type ChatMessageRow = {
  id: string
  sender_name: string
  sender_identity: string | null
  content: string
  created_at: string
  type: 'attachment'
  attachment_name: string | null
  attachment_mime_type: string | null
  attachment_size: number | null
}

type FileValidationResult =
  | { ok: true; extension: string; mimeType: string }
  | { ok: false; error: string }

function publicAttachmentMessage(row: ChatMessageRow) {
  return {
    type: 'chat' as const,
    id: row.id,
    messageKind: 'attachment' as const,
    text: row.content,
    senderName: row.sender_name,
    senderIdentity: row.sender_identity,
    sentAt: Date.parse(row.created_at),
    attachment: {
      name: row.attachment_name || row.content,
      mimeType: row.attachment_mime_type || 'application/octet-stream',
      size: row.attachment_size || 0,
    },
  }
}

function getExtension(fileName: string) {
  const normalized = fileName.trim().toLowerCase()
  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === normalized.length - 1) return null
  return normalized.slice(dotIndex + 1)
}

function sanitizeFileName(fileName: string) {
  const fallback = 'arquivo'
  const trimmed = fileName.trim().replace(/[/\\]/g, '-')
  const withoutControls = trimmed.replace(/[\u0000-\u001f\u007f]/g, '')
  const safe = withoutControls.replace(/[^a-zA-Z0-9._ -]/g, '-').replace(/\s+/g, '-').slice(0, 90)
  return safe || fallback
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100) || 'room'
}

function normalizeSenderName(value: FormDataEntryValue | null, fallback: string | null) {
  if (typeof value === 'string') {
    const trimmed = value.trim().slice(0, 60)
    if (trimmed.length >= 2) return trimmed
  }

  return fallback || 'Participante'
}

function normalizeSenderIdentity(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim().slice(0, 120)
  return trimmed.length > 0 ? trimmed : null
}

function validateFile(file: File): FileValidationResult {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { ok: false, error: 'Arquivo muito grande. Envie um arquivo de ate 5 MB.' }
  }

  if (file.size <= 0) {
    return { ok: false, error: 'Arquivo vazio.' }
  }

  const extension = getExtension(file.name)
  if (!extension || BLOCKED_EXTENSIONS.has(extension)) {
    return { ok: false, error: 'Tipo de arquivo nao permitido.' }
  }

  const expectedMime = ALLOWED_MIME_BY_EXTENSION[extension]
  if (!expectedMime || file.type !== expectedMime) {
    return { ok: false, error: 'Tipo de arquivo nao permitido.' }
  }

  return { ok: true, extension, mimeType: expectedMime }
}

async function requireApprovedRoomAccess(request: Request, context: AttachmentsRouteContext) {
  const auth = await requireUser(request)
  if ('error' in auth) return { error: auth.error }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { error: jsonError('Configuracao Supabase ausente no servidor.', 500) }

  const { roomName } = await context.params
  const room = await getRoomByName(supabase, decodeURIComponent(roomName))

  if (!room) return { error: jsonError('Sala nao encontrada.', 404) }

  const updatedRoom = await expireRoomIfNeeded(supabase, room)
  if (
    updatedRoom.status === 'expired' ||
    updatedRoom.status === 'ended' ||
    hasRoomExpired(updatedRoom)
  ) {
    return { error: jsonError('Esta sala nao esta ativa.', 403) }
  }

  const membership = await getMembership(supabase, updatedRoom.id, auth.user.id)
  if (!membership || !canJoinRoom(membership)) {
    return { error: jsonError('Voce ainda nao tem autorizacao para acessar o chat desta sala.', 403) }
  }

  return { auth, supabase, room: updatedRoom, membership }
}

export async function POST(request: Request, context: AttachmentsRouteContext) {
  const access = await requireApprovedRoomAccess(request, context)
  if ('error' in access) return access.error

  let formData: FormData

  try {
    formData = await request.formData()
  } catch {
    return jsonError('Envio invalido.', 400)
  }

  const file = formData.get('file')
  if (!(file instanceof File)) return jsonError('Arquivo obrigatorio.', 400)

  const validation = validateFile(file)
  if (!validation.ok) return jsonError(validation.error, 400)

  const messageIdValue = formData.get('id')
  const messageId = typeof messageIdValue === 'string' && messageIdValue.trim()
    ? messageIdValue.trim()
    : crypto.randomUUID()
  const senderName = normalizeSenderName(formData.get('senderName'), access.membership.display_name)
  const senderIdentity = normalizeSenderIdentity(formData.get('senderIdentity'))
  const displayName = sanitizeFileName(file.name)
  const storageName = `${Date.now()}-${crypto.randomUUID()}.${validation.extension}`
  const storagePath = `meet/${sanitizePathSegment(access.room.room_name)}/${messageId}/${storageName}`

  const { error: uploadError } = await access.supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file, {
      contentType: validation.mimeType,
      upsert: false,
    })

  if (uploadError) {
    return jsonError('Nao foi possivel enviar o arquivo. Tente novamente.', 500)
  }

  const { data, error } = await access.supabase
    .from('meet_room_chat_messages')
    .insert({
      id: messageId,
      room_id: access.room.id,
      room_name: access.room.room_name,
      sender_user_id: access.auth.user.id,
      sender_identity: senderIdentity,
      sender_name: senderName,
      content: displayName,
      type: 'attachment',
      attachment_name: displayName,
      attachment_path: storagePath,
      attachment_mime_type: validation.mimeType,
      attachment_size: file.size,
    })
    .select('id, sender_name, sender_identity, content, created_at, type, attachment_name, attachment_mime_type, attachment_size')
    .single()

  if (error) {
    await access.supabase.storage.from(BUCKET_NAME).remove([storagePath])
    return jsonError('Nao foi possivel enviar o arquivo. Tente novamente.', 500)
  }

  return NextResponse.json({ ok: true, message: publicAttachmentMessage(data as ChatMessageRow) })
}
