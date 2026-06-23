import { jsonError } from '@/lib/meet-server'
import { getMeetRecordingAccess } from '@/lib/meet/recording-access'
import { MEET_RECORDING_HOST_REQUIRED_MESSAGE } from '@/lib/meet/recording-permissions'
import { MEET_RECORDING_FAILURE_MESSAGE, toPublicMeetRecording, type MeetRecordingRow } from '@/lib/meet/recording-flow'
import {
  getMeetRecordingUnavailableMessage,
  isMeetRecordingInfrastructureConfigured,
  stopMeetRoomEgress,
} from '@/lib/meet/recording-server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type StopRecordingContext = {
  params: Promise<{ roomName: string }>
}

type StopRecordingRow = MeetRecordingRow & {
  egress_id: string | null
}

export async function POST(request: Request, context: StopRecordingContext) {
  const { roomName } = await context.params
  const access = await getMeetRecordingAccess(request, decodeURIComponent(roomName))
  if ('error' in access) return access.error

  if (!access.canManage) return jsonError(MEET_RECORDING_HOST_REQUIRED_MESSAGE, 403)

  const { data: current, error: currentError } = await access.supabase
    .from('meet_room_recordings')
    .select('id, status, created_at, started_at, ended_at, duration_seconds, file_size_bytes, error_message, egress_id, storage_key, storage_bucket, compression_profile, retention_expires_at, storage_estimate_bytes')
    .eq('room_id', access.room.id)
    .in('status', ['preparing', 'recording'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (currentError) return jsonError('Não foi possível localizar a gravação em andamento.', 500)
  if (!current) return jsonError('Não há gravação em andamento nesta sala.', 409)

  const recording = current as StopRecordingRow
  const endedAt = new Date().toISOString()

  if (!recording.egress_id) {
    const { data: cancelled, error: cancelError } = await access.supabase
      .from('meet_room_recordings')
      .update({ status: 'cancelled', ended_at: endedAt })
      .eq('id', recording.id)
      .select('id, status, created_at, started_at, ended_at, duration_seconds, file_size_bytes, error_message, storage_key, storage_bucket, compression_profile, retention_expires_at, storage_estimate_bytes')
      .single()
    if (cancelError || !cancelled) return jsonError(MEET_RECORDING_FAILURE_MESSAGE, 500)
    return NextResponse.json({ ok: true, recording: toPublicMeetRecording(cancelled as StopRecordingRow, false) })
  }

  if (!isMeetRecordingInfrastructureConfigured()) {
    return jsonError(getMeetRecordingUnavailableMessage(), 503)
  }

  try {
    await stopMeetRoomEgress(recording.egress_id)
  } catch {
    return jsonError('Não foi possível parar a gravação agora.', 502)
  }

  const { data: processing, error: updateError } = await access.supabase
    .from('meet_room_recordings')
    .update({ status: 'processing', ended_at: endedAt })
    .eq('id', recording.id)
    .select('id, status, created_at, started_at, ended_at, duration_seconds, file_size_bytes, error_message, storage_key, storage_bucket, compression_profile, retention_expires_at, storage_estimate_bytes')
    .single()

  if (updateError || !processing) return jsonError(MEET_RECORDING_FAILURE_MESSAGE, 500)
  return NextResponse.json({ ok: true, recording: toPublicMeetRecording(processing as StopRecordingRow, false) })
}
