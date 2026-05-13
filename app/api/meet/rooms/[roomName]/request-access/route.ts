import {
  expireRoomIfNeeded,
  getMembership,
  getProfileDisplayName,
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

export async function POST(request: Request, context: RoomRouteContext) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuração Supabase ausente no servidor.', 500)

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
    return NextResponse.json({ ok: true, status: 'approved' })
  }

  if (membership?.status === 'approved' || membership?.status === 'pending') {
    return NextResponse.json({ ok: true, status: membership.status })
  }

  const displayName = await getProfileDisplayName(supabase, auth.user)

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

    return NextResponse.json({ ok: true, status: 'pending' })
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

  return NextResponse.json({ ok: true, status: 'pending' })
}
