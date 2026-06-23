import { jsonError } from '@/lib/meet-server'
import { getMeetRecordingAccess } from '@/lib/meet/recording-access'
import { MEET_RECORDING_HOST_REQUIRED_MESSAGE } from '@/lib/meet/recording-permissions'
import { createR2GetSignedUrl, R2_SIGNED_GET_EXPIRATION_SECONDS } from '@/lib/r2/signed-url'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DownloadRecordingContext = {
  params: Promise<{ roomName: string; recordingId: string }>
}

type DownloadRecordingRow = {
  id: string
  status: string
  storage_provider: string | null
  storage_bucket: string | null
  storage_key: string | null
}

function isSafeRecordingId(value: string) {
  return /^[0-9a-fA-F-]{20,80}$/.test(value)
}

function isSafeMeetRecordingKey(value: string | null): value is string {
  return Boolean(
    value &&
      value.startsWith('meet-recordings/') &&
      !value.includes('..') &&
      !value.includes('\\') &&
      !value.includes('?') &&
      !value.includes('#'),
  )
}

export async function GET(request: Request, context: DownloadRecordingContext) {
  const { roomName, recordingId } = await context.params
  const access = await getMeetRecordingAccess(request, decodeURIComponent(roomName))
  if ('error' in access) return access.error

  if (!access.canManage) return jsonError(MEET_RECORDING_HOST_REQUIRED_MESSAGE, 403)
  if (!isSafeRecordingId(recordingId)) return jsonError('Gravação inválida.', 400)

  const { data, error } = await access.supabase
    .from('meet_room_recordings')
    .select('id, status, storage_provider, storage_bucket, storage_key')
    .eq('id', recordingId)
    .eq('room_id', access.room.id)
    .maybeSingle()

  const recording = data as DownloadRecordingRow | null
  if (error || !recording || recording.status !== 'ready') {
    return jsonError('Gravação não disponível para download.', 404)
  }

  if (
    recording.storage_provider !== 'r2' ||
    !recording.storage_bucket ||
    !isSafeMeetRecordingKey(recording.storage_key)
  ) {
    return jsonError('Gravação não disponível para download.', 404)
  }

  try {
    const url = await createR2GetSignedUrl({
      bucket: recording.storage_bucket,
      key: recording.storage_key,
      contentType: 'video/mp4',
      expiresInSeconds: R2_SIGNED_GET_EXPIRATION_SECONDS,
    })
    return NextResponse.json({ ok: true, url, expiresIn: R2_SIGNED_GET_EXPIRATION_SECONDS })
  } catch {
    return jsonError('Não foi possível gerar o download seguro.', 502)
  }
}
