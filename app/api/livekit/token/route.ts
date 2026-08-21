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
import { createRateLimiter, createRateLimitExceededResponse } from '@/lib/rate-limit'
import {
  createServerIssuedLiveKitIdentity,
  validateMeetingParticipantName,
} from '@/lib/meet/participant-name'

const MAX_ROOM_NAME_LENGTH = 80

const LIVEKIT_TOKEN_IP_LIMITER = createRateLimiter({
  limit: 30,
  windowMs: 10 * 60 * 1000,
})

const LIVEKIT_TOKEN_USER_ROOM_LIMITER = createRateLimiter({
  limit: 20,
  windowMs: 10 * 60 * 1000,
})

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

function getRateLimitIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown'
}

export async function POST(request: Request): Promise<Response> {
  const ipRateLimit = await LIVEKIT_TOKEN_IP_LIMITER.check({
    key: `${getRateLimitIp(request)}:livekit-token`,
  })

  if (!ipRateLimit.ok) {
    return createRateLimitExceededResponse(ipRateLimit, {
      ok: false,
      error: 'RATE_LIMITED',
      message: 'Muitas solicitações de acesso à chamada. Tente novamente mais tarde.',
    })
  }

  const auth = await requireUser(request)
  if ('error' in auth) return auth.error ?? jsonError('Nao foi possivel validar sua sessao.', 500)

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

  const userRoomRateLimit = await LIVEKIT_TOKEN_USER_ROOM_LIMITER.check({
    key: `${auth.user.id}:${roomName.value}:livekit-token`,
  })

  if (!userRoomRateLimit.ok) {
    return createRateLimitExceededResponse(userRoomRateLimit, {
      ok: false,
      error: 'RATE_LIMITED',
      message: 'Muitas solicitações de acesso à chamada. Tente novamente mais tarde.',
    })
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
      return jsonError('Esta sala expirou.', 403)
    }

    const membership = await getMembership(supabase, updatedRoom.id, auth.user.id)

    if (!canJoinRoom(membership)) {
      return jsonError('Você ainda não tem autorização para entrar nesta sala.', 403)
    }

    const participantNameValidation = validateMeetingParticipantName(
      body.participantName === undefined ? membership?.display_name : body.participantName,
    )
    if (!participantNameValidation.ok) {
      if (participantNameValidation.code === 'too_long') {
        return jsonError('Nome na chamada e muito longo.', 400)
      }
      return jsonError('Informe seu nome para entrar na chamada.', 400)
    }
    const participantName = participantNameValidation.value

    const secondsLeft = Math.max(
      60,
      Math.floor((Date.parse(updatedRoom.expires_at) - Date.now()) / 1000),
    )
    const identity = createServerIssuedLiveKitIdentity(auth.user.id)
    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: participantName,
      ttl: secondsLeft,
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
