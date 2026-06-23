import {
  hasActiveMeetRecordingRetention,
  isMeetRecordingCompressionProfile,
} from './recording-compression'

export const MEET_RECORDING_UNAVAILABLE_MESSAGE =
  'A gravação ainda não está configurada neste ambiente. Quando for ativada, usará um perfil otimizado para economizar armazenamento.'
export const MEET_RECORDING_FAILURE_MESSAGE = 'Não foi possível iniciar a gravação agora.'
export const MEET_RECORDING_LIMIT_EXCEEDED_MESSAGE =
  'A gravação ultrapassou o limite de duração ou tamanho definido para armazenamento.'

export const MEET_RECORDING_STATUSES = [
  'preparing',
  'recording',
  'processing',
  'ready',
  'failed',
  'cancelled',
] as const

export type MeetRecordingStatus = (typeof MEET_RECORDING_STATUSES)[number]

export type MeetRecordingRow = {
  id: string
  status: MeetRecordingStatus
  created_at: string
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  file_size_bytes: number | null
  error_message: string | null
  storage_key?: string | null
  storage_bucket?: string | null
  egress_id?: string | null
  compression_profile?: string | null
  retention_expires_at?: string | null
  storage_estimate_bytes?: number | null
}

export type PublicMeetRecording = {
  id: string
  status: MeetRecordingStatus
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  durationSeconds: number | null
  fileSizeBytes: number | null
  errorMessage: string | null
  compressionProfile: 'economy' | 'standard' | null
  retentionExpiresAt: string | null
  canDownload: boolean
}

export function isMeetRecordingStatus(value: unknown): value is MeetRecordingStatus {
  return typeof value === 'string' && (MEET_RECORDING_STATUSES as readonly string[]).includes(value)
}

export function isActiveMeetRecordingStatus(status: MeetRecordingStatus) {
  return status === 'preparing' || status === 'recording' || status === 'processing'
}

export function getMeetRecordingStatusLabel(status: MeetRecordingStatus) {
  switch (status) {
    case 'preparing':
      return 'Preparando gravação'
    case 'recording':
      return 'Gravando'
    case 'processing':
      return 'Processando gravação'
    case 'ready':
      return 'Gravação pronta'
    case 'failed':
      return 'Falha na gravação'
    case 'cancelled':
      return 'Gravação cancelada'
  }
}

export function getMeetRecordingParticipantNotice(status: MeetRecordingStatus) {
  return status === 'recording' ? 'Esta reunião está sendo gravada.' : null
}

export function canDownloadMeetRecording(status: MeetRecordingStatus) {
  return status === 'ready'
}

export function toPublicMeetRecording(
  row: MeetRecordingRow,
  canDownload: boolean,
): PublicMeetRecording {
  const compressionProfile = isMeetRecordingCompressionProfile(row.compression_profile)
    ? row.compression_profile
    : null
  const retentionExpiresAt = row.retention_expires_at ?? null

  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    fileSizeBytes: row.file_size_bytes,
    errorMessage: row.status === 'failed' ? row.error_message || MEET_RECORDING_FAILURE_MESSAGE : null,
    compressionProfile,
    retentionExpiresAt,
    canDownload:
      canDownload &&
      canDownloadMeetRecording(row.status) &&
      hasActiveMeetRecordingRetention(retentionExpiresAt),
  }
}
