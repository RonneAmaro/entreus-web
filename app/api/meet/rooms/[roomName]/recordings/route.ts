import { hasRoomExpired, jsonError } from '@/lib/meet-server'
import { getMeetRecordingAccess } from '@/lib/meet/recording-access'
import {
  isActiveMeetRecordingStatus,
  isMeetRecordingStatus,
  toPublicMeetRecording,
  type MeetRecordingRow,
} from '@/lib/meet/recording-flow'
import { refreshMeetRecordingFromEgress } from '@/lib/meet/recording-server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RecordingRouteContext = {
  params: Promise<{ roomName: string }>
}

type RecordingDatabaseRow = MeetRecordingRow & {
  room_id: string
  created_by: string
  recording_provider: string | null
  storage_provider: string | null
  storage_bucket: string | null
}

async function refreshRecordingRow(
  row: RecordingDatabaseRow,
  updateRow: (update: Record<string, unknown>) => Promise<void>,
) {
  if (!isActiveMeetRecordingStatus(row.status)) return row

  try {
    const update = await refreshMeetRecordingFromEgress(row)
    if (!update) return row
    await updateRow(update)
    return { ...row, ...update } as RecordingDatabaseRow
  } catch {
    // A status refresh is best-effort. It must never report a successful recording
    // when Egress cannot be reached.
    return row
  }
}

export async function GET(request: Request, context: RecordingRouteContext) {
  const { roomName } = await context.params
  const access = await getMeetRecordingAccess(request, decodeURIComponent(roomName))
  if ('error' in access) return access.error

  if (!access.isApprovedParticipant && !access.canManage) {
    return jsonError('Você ainda não tem autorização para ver o estado da gravação desta sala.', 403)
  }

  const { data, error } = await access.supabase
    .from('meet_room_recordings')
    .select('id, room_id, created_by, status, recording_provider, egress_id, storage_provider, storage_bucket, storage_key, file_size_bytes, duration_seconds, error_message, started_at, ended_at, created_at')
    .eq('room_id', access.room.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return jsonError('Não foi possível carregar as gravações desta sala.', 500)

  const rows = (data ?? []) as RecordingDatabaseRow[]
  const refreshedRows = await Promise.all(
    rows.map((row) =>
      refreshRecordingRow(row, async (update) => {
        await access.supabase.from('meet_room_recordings').update(update).eq('id', row.id)
      }),
    ),
  )
  const activeRow = refreshedRows.find((row) => isMeetRecordingStatus(row.status) && isActiveMeetRecordingStatus(row.status))
  const canDownload = access.canManage

  return NextResponse.json({
    ok: true,
    canManage: access.canManage,
    roomActive: !hasRoomExpired(access.room) && access.room.status === 'active',
    activeRecording: activeRow ? toPublicMeetRecording(activeRow, false) : null,
    recordings: access.canManage
      ? refreshedRows.map((row) => toPublicMeetRecording(row, canDownload))
      : [],
  })
}
