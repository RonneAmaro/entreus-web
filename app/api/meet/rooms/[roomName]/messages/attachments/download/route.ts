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
const SIGNED_URL_EXPIRES_IN_SECONDS = 60

type DownloadRouteContext = {
  params: Promise<{ roomName: string }>
}

type AttachmentRow = {
  id: string
  attachment_name: string | null
  attachment_path: string | null
}

function isSafeMessageId(value: string | null) {
  return Boolean(value && /^[0-9a-fA-F-]{20,80}$/.test(value))
}

async function requireApprovedRoomAccess(request: Request, context: DownloadRouteContext) {
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
    return { error: jsonError('Voce ainda nao tem autorizacao para baixar anexos desta sala.', 403) }
  }

  return { supabase, room: updatedRoom }
}

export async function GET(request: Request, context: DownloadRouteContext) {
  const access = await requireApprovedRoomAccess(request, context)
  if ('error' in access) return access.error

  const { searchParams } = new URL(request.url)
  const messageId = searchParams.get('messageId')

  if (!isSafeMessageId(messageId)) {
    return jsonError('Anexo invalido.', 400)
  }

  const { data, error } = await access.supabase
    .from('meet_room_chat_messages')
    .select('id, attachment_name, attachment_path')
    .eq('room_id', access.room.id)
    .eq('room_name', access.room.room_name)
    .eq('id', messageId)
    .eq('type', 'attachment')
    .maybeSingle()

  if (error || !data) {
    return jsonError('Anexo nao encontrado.', 404)
  }

  const attachment = data as AttachmentRow
  if (!attachment.attachment_path || attachment.attachment_path.includes('..')) {
    return jsonError('Anexo invalido.', 400)
  }

  const storage = access.supabase.storage.from(BUCKET_NAME)
  const { data: signedData, error: signedError } = await storage.createSignedUrl(
    attachment.attachment_path,
    SIGNED_URL_EXPIRES_IN_SECONDS,
    { download: attachment.attachment_name || true } as never,
  )

  if (signedError || !signedData?.signedUrl) {
    return jsonError('Nao foi possivel gerar o download.', 500)
  }

  return NextResponse.json({ ok: true, url: signedData.signedUrl })
}
