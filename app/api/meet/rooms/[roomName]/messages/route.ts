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

const MAX_CHAT_MESSAGE_LENGTH = 500
const MAX_CHAT_HISTORY_MESSAGES = 100

type MessagesRouteContext = {
  params: Promise<{ roomName: string }>
}

type ChatMessageRow = {
  id: string
  room_name: string
  sender_name: string
  sender_identity: string | null
  content: string
  created_at: string
  type: 'text'
}

type CreateMessageBody = {
  id?: unknown
  content?: unknown
  senderName?: unknown
  senderIdentity?: unknown
  type?: unknown
}

function publicChatMessage(row: ChatMessageRow) {
  return {
    type: 'chat' as const,
    id: row.id,
    text: row.content,
    senderName: row.sender_name,
    senderIdentity: row.sender_identity,
    sentAt: Date.parse(row.created_at),
  }
}

function normalizeMessageContent(value: unknown) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH)
  return trimmed.length > 0 ? trimmed : null
}

function normalizeSenderName(value: unknown, fallback: string | null) {
  if (typeof value === 'string') {
    const trimmed = value.trim().slice(0, 60)
    if (trimmed.length >= 2) return trimmed
  }

  return fallback || 'Participante'
}

function normalizeSenderIdentity(value: unknown) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim().slice(0, 120)
  return trimmed.length > 0 ? trimmed : null
}

async function requireApprovedRoomAccess(request: Request, context: MessagesRouteContext) {
  const auth = await requireUser(request)
  if ('error' in auth) return { error: auth.error }

  const supabase = getSupabaseAdmin()
  if (!supabase) return { error: jsonError('Configuração Supabase ausente no servidor.', 500) }

  const { roomName } = await context.params
  const room = await getRoomByName(supabase, decodeURIComponent(roomName))

  if (!room) return { error: jsonError('Sala não encontrada.', 404) }

  const updatedRoom = await expireRoomIfNeeded(supabase, room)

  if (
    updatedRoom.status === 'expired' ||
    updatedRoom.status === 'ended' ||
    hasRoomExpired(updatedRoom)
  ) {
    return { error: jsonError('Esta sala não está ativa.', 403) }
  }

  const membership = await getMembership(supabase, updatedRoom.id, auth.user.id)
  if (!membership || !canJoinRoom(membership)) {
    return { error: jsonError('Você ainda não tem autorização para acessar o chat desta sala.', 403) }
  }

  return { auth, supabase, room: updatedRoom, membership }
}

export async function GET(request: Request, context: MessagesRouteContext) {
  const access = await requireApprovedRoomAccess(request, context)
  if ('error' in access) return access.error

  const { data, error } = await access.supabase
    .from('meet_room_chat_messages')
    .select('id, room_name, sender_name, sender_identity, content, created_at, type')
    .eq('room_id', access.room.id)
    .eq('room_name', access.room.room_name)
    .eq('type', 'text')
    .order('created_at', { ascending: false })
    .limit(MAX_CHAT_HISTORY_MESSAGES)

  if (error) {
    return jsonError('Não foi possível carregar o histórico do chat.', 500)
  }

  const messages = ((data ?? []) as ChatMessageRow[])
    .reverse()
    .map((row) => publicChatMessage(row))

  return NextResponse.json({ ok: true, messages })
}

export async function POST(request: Request, context: MessagesRouteContext) {
  const access = await requireApprovedRoomAccess(request, context)
  if ('error' in access) return access.error

  let body: CreateMessageBody

  try {
    body = (await request.json()) as CreateMessageBody
  } catch {
    return jsonError('JSON inválido.', 400)
  }

  const content = normalizeMessageContent(body.content)
  if (!content) return jsonError('Mensagem vazia.', 400)

  const messageType = typeof body.type === 'string' ? body.type : 'text'
  if (messageType !== 'text') return jsonError('Tipo de mensagem inválido.', 400)

  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : crypto.randomUUID()
  const senderName = normalizeSenderName(body.senderName, access.membership.display_name)
  const senderIdentity = normalizeSenderIdentity(body.senderIdentity)

  const { data, error } = await access.supabase
    .from('meet_room_chat_messages')
    .insert({
      id,
      room_id: access.room.id,
      room_name: access.room.room_name,
      sender_user_id: access.auth.user.id,
      sender_identity: senderIdentity,
      sender_name: senderName,
      content,
      type: 'text',
    })
    .select('id, room_name, sender_name, sender_identity, content, created_at, type')
    .single()

  if (error) {
    return jsonError('Não foi possível salvar a mensagem.', 500)
  }

  return NextResponse.json({ ok: true, message: publicChatMessage(data as ChatMessageRow) })
}
