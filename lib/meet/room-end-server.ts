import type { SupabaseClient } from '@supabase/supabase-js'
import { getRoomByName, type MeetRoom } from '@/lib/meet-server'
import { isLiveKitNotFoundError } from './livekit-room-server'
import { stopMeetRoomEgress } from './recording-server'

type ActiveRecordingRow = {
  id: string
  status: 'preparing' | 'recording'
  ended_at: string | null
  egress_id: string | null
}

export async function markMeetRoomEnded(
  supabase: SupabaseClient,
  room: MeetRoom,
  endedAt: string,
) {
  if (room.status === 'ended') return room
  if (room.status === 'expired') return room

  const { data, error } = await supabase
    .from('meet_rooms')
    .update({ status: 'ended', ended_at: endedAt })
    .eq('id', room.id)
    .eq('status', 'active')
    .select('*')
    .maybeSingle()

  if (error) throw error
  if (data) return data as MeetRoom

  const current = await getRoomByName(supabase, room.room_name)
  if (!current) throw new Error('MEET_ROOM_DISAPPEARED_DURING_END')
  return current
}

export async function stopActiveMeetRoomRecordings(
  supabase: SupabaseClient,
  roomId: string,
  endedAt: string,
  stopEgress: (egressId: string) => Promise<unknown> = stopMeetRoomEgress,
) {
  const { data, error } = await supabase
    .from('meet_room_recordings')
    .select('id, status, ended_at, egress_id')
    .eq('room_id', roomId)
    .in('status', ['preparing', 'recording'])

  if (error) throw error

  for (const row of (data ?? []) as ActiveRecordingRow[]) {
    const finalEndedAt = row.ended_at || endedAt

    if (!row.egress_id) {
      const { error: updateError } = await supabase
        .from('meet_room_recordings')
        .update({ status: 'cancelled', ended_at: finalEndedAt })
        .eq('id', row.id)
        .in('status', ['preparing', 'recording'])
      if (updateError) throw updateError
      continue
    }

    try {
      await stopEgress(row.egress_id)
    } catch (stopError) {
      if (!isLiveKitNotFoundError(stopError)) throw stopError
    }

    const { error: updateError } = await supabase
      .from('meet_room_recordings')
      .update({ status: 'processing', ended_at: finalEndedAt })
      .eq('id', row.id)
      .in('status', ['preparing', 'recording'])
    if (updateError) throw updateError
  }
}
