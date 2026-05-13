import {
  canJoinRoom,
  getMembership,
  getRoomByName,
  getSupabaseAdmin,
  jsonError,
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

  if (!room) return jsonError('Sala não encontrada.', 404)

  const membership = await getMembership(supabase, room.id, auth.user.id)
  if (!canJoinRoom(membership)) {
    return jsonError('Você ainda não tem autorização para entrar nesta sala.', 403)
  }

  const { data, error } = await supabase
    .from('meet_room_members')
    .select('user_id, display_name, hand_raised_at')
    .eq('room_id', room.id)
    .eq('status', 'approved')
    .eq('hand_raised', true)
    .order('hand_raised_at', { ascending: true })

  if (error) {
    return jsonError('Não foi possível carregar mãos levantadas.', 500)
  }

  return NextResponse.json({
    ok: true,
    hands: (data ?? []).map((item) => ({
      userId: item.user_id,
      displayName: item.display_name,
      handRaisedAt: item.hand_raised_at,
    })),
  })
}
