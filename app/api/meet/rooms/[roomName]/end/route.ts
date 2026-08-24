import {
  getRoomByName,
  getSupabaseAdmin,
  jsonError,
  requireUser,
} from '@/lib/meet-server'
import { deleteLiveKitMeetRoom } from '@/lib/meet/livekit-room-server'
import { markMeetRoomEnded, stopActiveMeetRoomRecordings } from '@/lib/meet/room-end-server'
import { logServerEvent } from '@/lib/logging/safe-logger'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type EndRoomContext = {
  params: Promise<{ roomName: string }>
}

export async function POST(request: Request, context: EndRoomContext) {
  const auth = await requireUser(request)
  if ('error' in auth) return auth.error ?? jsonError('Não foi possível validar sua sessão.', 500)

  const supabase = getSupabaseAdmin()
  if (!supabase) return jsonError('Configuração Supabase ausente no servidor.', 500)

  const { roomName } = await context.params
  const decodedRoomName = decodeURIComponent(roomName)

  let room
  try {
    room = await getRoomByName(supabase, decodedRoomName)
  } catch {
    return jsonError('Não foi possível localizar a sala.', 500)
  }

  if (!room) return jsonError('Sala não encontrada.', 404)
  if (room.owner_id !== auth.user.id) {
    return jsonError('Somente o criador pode encerrar esta reunião.', 403)
  }
  if (room.status === 'expired') {
    return jsonError('Esta sala já expirou.', 409)
  }

  const endedAt = room.ended_at || new Date().toISOString()
  let endedRoom

  try {
    endedRoom = await markMeetRoomEnded(supabase, room, endedAt)
  } catch (error) {
    logServerEvent('error', { event: 'meet.room_end_status_failed', error })
    return jsonError('Não foi possível encerrar a reunião.', 500)
  }

  if (endedRoom.status !== 'ended') {
    return jsonError('A sala não está disponível para encerramento.', 409)
  }

  const cleanupFailures: string[] = []

  try {
    await stopActiveMeetRoomRecordings(supabase, endedRoom.id, endedRoom.ended_at || endedAt)
  } catch (error) {
    cleanupFailures.push('egress')
    logServerEvent('error', { event: 'meet.room_end_egress_cleanup_failed', error })
  }

  try {
    await deleteLiveKitMeetRoom(endedRoom.room_name)
  } catch (error) {
    cleanupFailures.push('room')
    logServerEvent('error', { event: 'meet.room_end_livekit_cleanup_failed', error })
  }

  if (cleanupFailures.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        ended: true,
        cleanupPending: true,
        error: 'A reunião foi encerrada, mas a limpeza de recursos precisa ser tentada novamente.',
      },
      { status: 502 },
    )
  }

  return NextResponse.json({
    ok: true,
    ended: true,
    endedAt: endedRoom.ended_at || endedAt,
  })
}
