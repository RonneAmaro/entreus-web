import {
  canModerate,
  getMembership,
  getRoomByName,
  getSupabaseAdmin,
  jsonError,
  requireUser,
} from '@/lib/meet-server'
import { NextResponse } from 'next/server'

type MemberRouteContext = {
  params: Promise<{ roomName: string; memberId: string }>
}

type PatchBody = {
  action?: unknown
}

export async function PATCH(request: Request, context: MemberRouteContext) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuração Supabase ausente no servidor.', 500)

  let body: PatchBody
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return jsonError('JSON inválido.', 400)
  }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return jsonError('Ação inválida.', 400)
  }

  const { roomName, memberId } = await context.params
  const room = await getRoomByName(supabase, decodeURIComponent(roomName))

  if (!room) return jsonError('Sala não encontrada.', 404)

  const moderator = await getMembership(supabase, room.id, auth.user.id)
  if (!canModerate(moderator)) {
    return jsonError('Você não tem autorização para moderar esta sala.', 403)
  }

  const now = new Date().toISOString()
  const payload =
    body.action === 'approve'
      ? { status: 'approved', approved_at: now, rejected_at: null }
      : { status: 'rejected', rejected_at: now, approved_at: null, hand_raised: false, hand_raised_at: null }

  const { error } = await supabase
    .from('meet_room_members')
    .update(payload)
    .eq('id', memberId)
    .eq('room_id', room.id)

  if (error) {
    return jsonError('Não foi possível atualizar a solicitação.', 500)
  }

  return NextResponse.json({ ok: true })
}
