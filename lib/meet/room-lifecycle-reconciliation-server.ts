import type { SupabaseClient } from '@supabase/supabase-js'
import { getRoomByName, type MeetRoom } from '@/lib/meet-server'
import {
  getLiveKitMeetRoom,
  type LiveKitRoomService,
  type LiveKitRoomSummary,
} from './livekit-room-server'
import { markMeetRoomEnded, stopActiveMeetRoomRecordings } from './room-end-server'

type ReconciliationOptions = {
  service?: LiveKitRoomService
  now?: () => Date
  cleanupRecordings?: (
    supabase: SupabaseClient,
    roomId: string,
    endedAt: string,
  ) => Promise<void>
}

export type MeetRoomLifecycleReconciliation = {
  room: MeetRoom
  checkedLiveKit: boolean
  liveKitRoom: LiveKitRoomSummary | null
  cleanupError: unknown | null
}

export async function markMeetRoomLiveKitCreated(
  supabase: SupabaseClient,
  room: MeetRoom,
  observedAt = new Date().toISOString(),
) {
  if (room.status !== 'active' || room.livekit_created_at) return room

  const { data, error } = await supabase
    .from('meet_rooms')
    .update({ livekit_created_at: observedAt })
    .eq('id', room.id)
    .eq('status', 'active')
    .is('livekit_created_at', null)
    .select('*')
    .maybeSingle()

  if (error) throw error
  if (data) return data as MeetRoom

  const current = await getRoomByName(supabase, room.room_name)
  if (!current) throw new Error('MEET_ROOM_DISAPPEARED_DURING_LIVEKIT_MARKER')
  if (current.status !== 'active' || current.livekit_created_at) return current
  throw new Error('MEET_ROOM_LIVEKIT_MARKER_NOT_PERSISTED')
}

export async function finishMeetRoomAfterLiveKitEnded(
  supabase: SupabaseClient,
  room: MeetRoom,
  options: ReconciliationOptions = {},
) {
  const endedAt = room.ended_at || (options.now ?? (() => new Date()))().toISOString()
  const endedRoom = await markMeetRoomEnded(supabase, room, endedAt)
  let cleanupError: unknown | null = null

  if (endedRoom.status === 'ended') {
    try {
      await (options.cleanupRecordings ?? stopActiveMeetRoomRecordings)(
        supabase,
        endedRoom.id,
        endedRoom.ended_at || endedAt,
      )
    } catch (error) {
      cleanupError = error
    }
  }

  return { room: endedRoom, cleanupError }
}

export async function reconcileMeetRoomLifecycle(
  supabase: SupabaseClient,
  room: MeetRoom,
  options: ReconciliationOptions = {},
): Promise<MeetRoomLifecycleReconciliation> {
  if (room.status !== 'active' || !room.livekit_created_at) {
    return {
      room,
      checkedLiveKit: false,
      liveKitRoom: null,
      cleanupError: null,
    }
  }

  const liveKitRoom = await getLiveKitMeetRoom(room.room_name, options.service)
  if (liveKitRoom) {
    return {
      room,
      checkedLiveKit: true,
      liveKitRoom,
      cleanupError: null,
    }
  }

  const finalized = await finishMeetRoomAfterLiveKitEnded(supabase, room, options)
  return {
    room: finalized.room,
    checkedLiveKit: true,
    liveKitRoom: null,
    cleanupError: finalized.cleanupError,
  }
}
