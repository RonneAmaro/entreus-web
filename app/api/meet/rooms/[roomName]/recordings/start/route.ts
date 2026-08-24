import { hasRoomExpired, jsonError } from '@/lib/meet-server'
import { getMeetRecordingAccess } from '@/lib/meet/recording-access'
import { evaluateMeetRecordingPermission } from '@/lib/meet/recording-permissions'
import {
  getMeetRecordingCompressionPolicy,
  getMeetRecordingPlanLimits,
  getMeetRecordingRetention,
} from '@/lib/meet/recording-compression'
import {
  MEET_RECORDING_FAILURE_MESSAGE,
  isActiveMeetRecordingStatus,
  toPublicMeetRecording,
  type MeetRecordingRow,
} from '@/lib/meet/recording-flow'
import {
  buildMeetRecordingStorageKey,
  getMeetRecordingStorageBucket,
  getMeetRecordingUnavailableMessage,
  isMeetRecordingInfrastructureConfigured,
  startMeetRoomEgress,
  stopMeetRoomEgress,
} from '@/lib/meet/recording-server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type StartRecordingContext = {
  params: Promise<{ roomName: string }>
}

type StartRecordingBody = {
  consentConfirmed?: unknown
}

type StartRecordingRow = MeetRecordingRow & {
  room_id: string
  created_by: string
}

export async function POST(request: Request, context: StartRecordingContext) {
  const { roomName } = await context.params
  const access = await getMeetRecordingAccess(request, decodeURIComponent(roomName))
  if ('error' in access) return access.error

  let body: StartRecordingBody = {}
  try {
    body = (await request.json()) as StartRecordingBody
  } catch {
    return jsonError('Dados da gravação inválidos.', 400)
  }

  const permission = evaluateMeetRecordingPermission({
    authenticated: true,
    isRoomModerator: access.isRoomModerator,
    isPlatformAdmin: access.isPlatformAdmin,
    isVipActive: access.isVipActive,
    isMinor: access.isMinor,
    consentConfirmed: body.consentConfirmed === true,
  })
  if (!permission.allowed) return jsonError(permission.message, permission.status)

  const recordingLimits = getMeetRecordingPlanLimits({
    isVipActive: access.isVipActive,
    isPlatformAdmin: access.isPlatformAdmin,
  })
  if (!recordingLimits.canStartRecording) {
    return jsonError('A gravação de reuniões exige VIP ativo.', 403)
  }

  if (access.room.status !== 'active' || hasRoomExpired(access.room)) {
    return jsonError('Esta sala não está ativa para iniciar uma gravação.', 403)
  }

  if (!isMeetRecordingInfrastructureConfigured()) {
    return jsonError(getMeetRecordingUnavailableMessage(), 503)
  }

  const storageBucket = getMeetRecordingStorageBucket()
  if (!storageBucket) return jsonError(getMeetRecordingUnavailableMessage(), 503)

  const { data: currentRows, error: currentError } = await access.supabase
    .from('meet_room_recordings')
    .select('id, status')
    .eq('room_id', access.room.id)
    .in('status', ['preparing', 'recording', 'processing'])
    .limit(1)

  if (currentError) return jsonError(MEET_RECORDING_FAILURE_MESSAGE, 500)
  if ((currentRows ?? []).some((row) => isActiveMeetRecordingStatus(row.status))) {
    return jsonError('Já existe uma gravação em andamento nesta sala.', 409)
  }

  const recordingId = crypto.randomUUID()
  const now = new Date().toISOString()
  const compressionPolicy = getMeetRecordingCompressionPolicy(recordingLimits.compressionProfile)
  const retention = getMeetRecordingRetention(new Date(now))
  const storageKey = buildMeetRecordingStorageKey(access.room.room_name, recordingId)
  const { data: inserted, error: insertError } = await access.supabase
    .from('meet_room_recordings')
    .insert({
      id: recordingId,
      room_id: access.room.id,
      room_name: access.room.room_name,
      created_by: access.auth.user.id,
      status: 'preparing',
      recording_provider: 'livekit-egress',
      storage_provider: 'r2',
      storage_bucket: storageBucket,
      storage_key: storageKey,
      compression_profile: recordingLimits.compressionProfile,
      storage_estimate_bytes: compressionPolicy.limits.estimatedFileSizeBytes,
      retention_expires_at: retention.retentionExpiresAt,
      consent_notice_shown_at: now,
    })
    .select('id, status, created_at, started_at, ended_at, duration_seconds, file_size_bytes, error_message, storage_key, storage_bucket, egress_id, compression_profile, retention_expires_at, storage_estimate_bytes')
    .single()

  if (insertError || !inserted) return jsonError(MEET_RECORDING_FAILURE_MESSAGE, 500)

  try {
    const egress = await startMeetRoomEgress({
      roomName: access.room.room_name,
      recordingId,
      compressionProfile: recordingLimits.compressionProfile,
    })
    const { data: recording, error: updateError } = await access.supabase
      .from('meet_room_recordings')
      .update({
        status: 'recording',
        started_at: now,
        egress_id: egress.egressId,
        storage_bucket: egress.storageBucket,
        storage_key: egress.storageKey,
      })
      .eq('id', recordingId)
      .eq('status', 'preparing')
      .select('id, status, created_at, started_at, ended_at, duration_seconds, file_size_bytes, error_message, storage_key, storage_bucket, egress_id, compression_profile, retention_expires_at, storage_estimate_bytes')
      .single()

    if (updateError || !recording) {
      try {
        await stopMeetRoomEgress(egress.egressId)
      } catch {
        // Avoid returning an Egress identifier or provider detail to the client.
      }
      await access.supabase
        .from('meet_room_recordings')
        .update({ status: 'failed', ended_at: new Date().toISOString(), error_message: MEET_RECORDING_FAILURE_MESSAGE })
        .eq('id', recordingId)
        .eq('status', 'preparing')
      return jsonError(MEET_RECORDING_FAILURE_MESSAGE, 500)
    }

    return NextResponse.json({
      ok: true,
      recording: toPublicMeetRecording(recording as StartRecordingRow, false),
    })
  } catch {
    await access.supabase
      .from('meet_room_recordings')
      .update({ status: 'failed', ended_at: new Date().toISOString(), error_message: MEET_RECORDING_FAILURE_MESSAGE })
      .eq('id', recordingId)
      .eq('status', 'preparing')
    return jsonError(MEET_RECORDING_FAILURE_MESSAGE, 502)
  }
}
