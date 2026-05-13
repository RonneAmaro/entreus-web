import {
  expireRoomIfNeeded,
  getMembership,
  getRoomByName,
  getSupabaseAdmin,
  hasRoomExpired,
  jsonError,
  requireUser,
} from '@/lib/meet-server'
import { NextResponse } from 'next/server'

type RoomRouteContext = {
  params: Promise<{ roomName: string }>
}

type RequestAccessBody = {
  displayName?: unknown
}

const MAX_DISPLAY_NAME_LENGTH = 60

function sanitizeDisplayName(value: unknown) {
  if (typeof value !== 'string') return null

  const displayName = value.trim().slice(0, MAX_DISPLAY_NAME_LENGTH)
  return displayName.length >= 2 ? displayName : null
}

export async function POST(request: Request, context: RoomRouteContext) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuração Supabase ausente no servidor.', 500)

  let body: RequestAccessBody

  try {
    body = (await request.json()) as RequestAccessBody
  } catch {
    return jsonError('JSON inválido.', 400)
  }

  const displayName = sanitizeDisplayName(body.displayName)

  if (!displayName) {
    return jsonError('Informe seu nome para entrar na chamada.', 400)
  }

  const { roomName } = await context.params
  const room = await getRoomByName(supabase, decodeURIComponent(roomName))

  if (!room) {
    return jsonError('Sala não encontrada.', 404)
  }

  const updatedRoom = await expireRoomIfNeeded(supabase, room)

  if (hasRoomExpired(updatedRoom) || updatedRoom.status !== 'active') {
    return jsonError('Esta sala gratuita expirou.', 403)
  }

  const membership = await getMembership(supabase, updatedRoom.id, auth.user.id)

  if (updatedRoom.owner_id === auth.user.id) {
    if (membership) {
      await supabase.from('meet_room_members').update({ display_name: displayName }).eq('id', membership.id)
    }

    return NextResponse.json({ ok: true, status: 'approved', displayName })
  }

  if (membership?.status === 'approved' || membership?.status === 'pending') {
    const { error } = await supabase
      .from('meet_room_members')
      .update({ display_name: displayName })
      .eq('id', membership.id)

    if (error) return jsonError('Não foi possível atualizar seu nome.', 500)

    return NextResponse.json({ ok: true, status: membership.status, displayName })
  }

  if (membership?.status === 'rejected' || membership?.status === 'left') {
    const { error } = await supabase
      .from('meet_room_members')
      .update({
        status: 'pending',
        display_name: displayName,
        hand_raised: false,
        hand_raised_at: null,
        requested_at: new Date().toISOString(),
        approved_at: null,
        rejected_at: null,
      })
      .eq('id', membership.id)

    if (error) return jsonError('Não foi possível pedir entrada.', 500)

    return NextResponse.json({ ok: true, status: 'pending', displayName })
  }

  const { error } = await supabase.from('meet_room_members').insert({
    room_id: updatedRoom.id,
    user_id: auth.user.id,
    role: 'participant',
    status: 'pending',
    display_name: displayName,
  })

  if (error) {
    return jsonError('Não foi possível pedir entrada.', 500)
  }

  return NextResponse.json({ ok: true, status: 'pending', displayName })
}
