import {
  expireRoomIfNeeded,
  getMembership,
  getRoomByName,
  getSupabaseAdmin,
  jsonError,
  publicMembership,
  publicRoom,
  requireUser,
} from '@/lib/meet-server'
import { NextResponse } from 'next/server'

type RoomRouteContext = {
  params: Promise<{ roomName: string }>
}

export async function GET(request: Request, context: RoomRouteContext) {
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
  const membership = await getMembership(supabase, updatedRoom.id, auth.user.id)

  return NextResponse.json({
    ok: true,
    room: publicRoom(updatedRoom, auth.user.id),
    membership: publicMembership(membership),
  })
}
