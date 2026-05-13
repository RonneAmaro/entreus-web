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
import { AccessToken } from 'livekit-server-sdk'
import { NextResponse } from 'next/server'

const MAX_ROOM_NAME_LENGTH = 80
const MAX_PARTICIPANT_NAME_LENGTH = 60

type TokenRequestBody = {
  roomName?: unknown
  participantName?: unknown
}

function readRequiredEnv(name: string) {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function validateTextField(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { error: `${fieldName} é obrigatório.` }
  }

  const trimmed = value.trim()

  if (trimmed.length > maxLength) {
    return { error: `${fieldName} é muito longo.` }
  }

  return { value: trimmed }
}

function sanitizeOptionalTextField(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim().slice(0, maxLength)
  return trimmed.length >= 2 ? trimmed : null
}

export async function POST(request: Request) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const livekitUrl = readRequiredEnv('LIVEKIT_URL')
  const livekitApiKey = readRequiredEnv('LIVEKIT_API_KEY')
  const livekitApiSecret = readRequiredEnv('LIVEKIT_API_SECRET')
  const supabase = getSupabaseAdmin()

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return jsonError('Configuração LiveKit ausente no servidor.', 500)
  }

  if (!supabase) {
    return jsonError('Configuração Supabase ausente no servidor.', 500)
  }

  let body: TokenRequestBody

  try {
    body = (await request.json()) as TokenRequestBody
  } catch {
    return jsonError('JSON inválido.', 400)
  }

  const roomName = validateTextField(body.roomName, 'roomName', MAX_ROOM_NAME_LENGTH)
  if (roomName.error) {
    return jsonError(roomName.error, 400)
  }

  if (!roomName.value) {
    return jsonError('Dados obrigatórios ausentes.', 400)
  }

  try {
    const room = await getRoomByName(supabase, roomName.value)

    if (!room) {
      return jsonError('Sala não encontrada.', 404)
    }

    const updatedRoom = await expireRoomIfNeeded(supabase, room)

    if (
      updatedRoom.status === 'expired' ||
      updatedRoom.status === 'ended' ||
      hasRoomExpired(updatedRoom)
    ) {
      return jsonError('Esta sala gratuita expirou.', 403)
    }

    const membership = await getMembership(supabase, updatedRoom.id, auth.user.id)

    if (!canJoinRoom(membership)) {
      return jsonError('Você ainda não tem autorização para entrar nesta sala.', 403)
    }

    const requestedParticipantName = sanitizeOptionalTextField(
      body.participantName,
      MAX_PARTICIPANT_NAME_LENGTH,
    )
    const participantName =
      requestedParticipantName ||
      sanitizeOptionalTextField(membership?.display_name, MAX_PARTICIPANT_NAME_LENGTH)

    if (!participantName) {
      return jsonError('Informe seu nome para entrar na chamada.', 400)
    }

    if (requestedParticipantName && membership?.display_name !== requestedParticipantName) {
      await supabase
        .from('meet_room_members')
        .update({ display_name: requestedParticipantName })
        .eq('id', membership!.id)
    }

    const secondsLeft = Math.max(
      60,
      Math.floor((Date.parse(updatedRoom.expires_at) - Date.now()) / 1000),
    )
    const tokenTtl = updatedRoom.plan === 'free' ? secondsLeft : '2h'
    const identity = `${auth.user.id}-${crypto.randomUUID().slice(0, 8)}`
    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: participantName,
      ttl: tokenTtl,
    })

    accessToken.addGrant({
      roomJoin: true,
      room: updatedRoom.room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })

    const token = await accessToken.toJwt()

    return NextResponse.json({
      ok: true,
      token,
      url: livekitUrl,
      roomName: updatedRoom.room_name,
      participantName,
    })
  } catch {
    return jsonError('Não foi possível gerar o token LiveKit.', 500)
  }
}
