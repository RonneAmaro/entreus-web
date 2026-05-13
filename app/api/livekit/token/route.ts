import { AccessToken } from 'livekit-server-sdk'
import { NextResponse } from 'next/server'

const MAX_ROOM_NAME_LENGTH = 80
const MAX_PARTICIPANT_NAME_LENGTH = 80

type TokenRequestBody = {
  roomName?: unknown
  participantName?: unknown
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
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

export async function POST(request: Request) {
  const livekitUrl = readRequiredEnv('LIVEKIT_URL')
  const livekitApiKey = readRequiredEnv('LIVEKIT_API_KEY')
  const livekitApiSecret = readRequiredEnv('LIVEKIT_API_SECRET')

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return jsonError('Configuração LiveKit ausente no servidor.', 500)
  }

  let body: TokenRequestBody

  try {
    body = (await request.json()) as TokenRequestBody
  } catch {
    return jsonError('JSON inválido.', 400)
  }

  const roomName = validateTextField(body.roomName, 'roomName', MAX_ROOM_NAME_LENGTH)
  const participantName = validateTextField(
    body.participantName,
    'participantName',
    MAX_PARTICIPANT_NAME_LENGTH,
  )

  if (roomName.error) {
    return jsonError(roomName.error, 400)
  }

  if (participantName.error) {
    return jsonError(participantName.error, 400)
  }

  try {
    const identity = `${participantName.value}-${crypto.randomUUID().slice(0, 8)}`
    const accessToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity,
      name: participantName.value,
      ttl: '2h',
    })

    accessToken.addGrant({
      roomJoin: true,
      room: roomName.value,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })

    const token = await accessToken.toJwt()

    return NextResponse.json({
      ok: true,
      token,
      url: livekitUrl,
      roomName: roomName.value,
      participantName: participantName.value,
    })
  } catch {
    return jsonError('Não foi possível gerar o token LiveKit.', 500)
  }
}
