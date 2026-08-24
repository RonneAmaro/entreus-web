import {
  canJoinRoom,
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
import { reconcileMeetRoomLifecycle } from '@/lib/meet/room-lifecycle-reconciliation-server'
import { logServerEvent } from '@/lib/logging/safe-logger'

type RoomRouteContext = {
  params: Promise<{ roomName: string }>
}

export async function GET(request: Request, context: RoomRouteContext) {
  const auth = await requireUser(request)
  if ('error' in auth) {
    return auth.error ?? jsonError('Não foi possível validar sua sessão.', 500)
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuração Supabase ausente no servidor.', 500)

  const { roomName } = await context.params
  const room = await getRoomByName(supabase, decodeURIComponent(roomName))

  if (!room) {
    return jsonError('Sala não encontrada.', 404)
  }

  let updatedRoom = await expireRoomIfNeeded(supabase, room)
  const membership = await getMembership(supabase, updatedRoom.id, auth.user.id)

  if (
    canJoinRoom(membership) &&
    updatedRoom.status === 'active' &&
    updatedRoom.livekit_created_at &&
    new URL(request.url).searchParams.get('reconcile') === '1'
  ) {
    try {
      const reconciliation = await reconcileMeetRoomLifecycle(supabase, updatedRoom)
      updatedRoom = reconciliation.room
      if (reconciliation.cleanupError) {
        logServerEvent('warn', {
          event: 'meet.room_status_reconciliation_cleanup_pending',
          error: reconciliation.cleanupError,
        })
      }
    } catch (error) {
      logServerEvent('warn', { event: 'meet.room_status_reconciliation_failed', error })
    }
  }

  return NextResponse.json({
    ok: true,
    room: publicRoom(updatedRoom, auth.user.id),
    membership: publicMembership(membership),
  })
}
