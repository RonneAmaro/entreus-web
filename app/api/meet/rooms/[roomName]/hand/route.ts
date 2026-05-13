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

type HandBody = {
  raised?: unknown
}

export async function POST(request: Request, context: RoomRouteContext) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuração Supabase ausente no servidor.', 500)

  let body: HandBody
  try {
    body = (await request.json()) as HandBody
  } catch {
    return jsonError('JSON inválido.', 400)
  }

  if (typeof body.raised !== 'boolean') {
    return jsonError('Informe se a mão está levantada.', 400)
  }

  const { roomName } = await context.params
  const room = await getRoomByName(supabase, decodeURIComponent(roomName))

  if (!room) return jsonError('Sala não encontrada.', 404)

  const membership = await getMembership(supabase, room.id, auth.user.id)
  if (!canJoinRoom(membership)) {
    return jsonError('Você ainda não tem autorização para entrar nesta sala.', 403)
  }

  const { data, error } = await supabase
    .from('meet_room_members')
    .update({
      hand_raised: body.raised,
      hand_raised_at: body.raised ? new Date().toISOString() : null,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', membership!.id)
    .select('hand_raised')
    .single()

  if (error) {
    return jsonError('Não foi possível atualizar sua mão.', 500)
  }

  return NextResponse.json({ ok: true, handRaised: Boolean(data.hand_raised) })
}
