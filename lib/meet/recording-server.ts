import { EgressStatus, EncodedFileOutput, S3Upload, type EgressInfo } from '@livekit/protocol'
import { EgressClient } from 'livekit-server-sdk'
import {
  getMeetRecordingEnvironmentDiagnostics,
  type MeetRecordingEnvironment,
} from './recording-environment'
import {
  MEET_RECORDING_FAILURE_MESSAGE,
  MEET_RECORDING_UNAVAILABLE_MESSAGE,
  type MeetRecordingRow,
  type MeetRecordingStatus,
} from './recording-flow'

type MeetRecordingInfrastructure = {
  livekitUrl: string
  livekitApiKey: string
  livekitApiSecret: string
  r2AccountId: string
  r2AccessKeyId: string
  r2SecretAccessKey: string
  r2BucketName: string
}

export type MeetRecordingEgressResult = {
  egressId: string
  storageBucket: string
  storageKey: string
}

function readRequiredEnv(name: string) {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getMeetRecordingInfrastructure(): MeetRecordingInfrastructure | null {
  if (!getMeetRecordingEnvironmentDiagnostics().ready) return null

  const livekitUrl = readRequiredEnv('LIVEKIT_URL')
  const livekitApiKey = readRequiredEnv('LIVEKIT_API_KEY')
  const livekitApiSecret = readRequiredEnv('LIVEKIT_API_SECRET')
  const r2AccountId = readRequiredEnv('R2_ACCOUNT_ID')
  const r2AccessKeyId = readRequiredEnv('R2_ACCESS_KEY_ID')
  const r2SecretAccessKey = readRequiredEnv('R2_SECRET_ACCESS_KEY')
  const r2BucketName = readRequiredEnv('R2_MEET_RECORDINGS_BUCKET_NAME')

  if (
    !livekitUrl ||
    !livekitApiKey ||
    !livekitApiSecret ||
    !r2AccountId ||
    !r2AccessKeyId ||
    !r2SecretAccessKey ||
    !r2BucketName
  ) {
    return null
  }

  return {
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    r2AccountId,
    r2AccessKeyId,
    r2SecretAccessKey,
    r2BucketName,
  }
}

function toHttpLivekitUrl(value: string) {
  const url = new URL(value)
  if (url.protocol === 'wss:') url.protocol = 'https:'
  if (url.protocol === 'ws:') url.protocol = 'http:'
  return url.toString().replace(/\/$/, '')
}

function safeRoomPathSegment(roomName: string) {
  return roomName.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
}

export function isMeetRecordingInfrastructureConfigured(
  environment: MeetRecordingEnvironment = process.env,
) {
  return getMeetRecordingEnvironmentDiagnostics(environment).ready
}

export function getMeetRecordingStorageBucket() {
  return getMeetRecordingInfrastructure()?.r2BucketName || null
}

export function getMeetRecordingUnavailableMessage() {
  return MEET_RECORDING_UNAVAILABLE_MESSAGE
}

export function buildMeetRecordingStorageKey(roomName: string, recordingId: string) {
  return `meet-recordings/${safeRoomPathSegment(roomName)}/${recordingId}.mp4`
}

function getEgressClient(infrastructure: MeetRecordingInfrastructure) {
  return new EgressClient(
    toHttpLivekitUrl(infrastructure.livekitUrl),
    infrastructure.livekitApiKey,
    infrastructure.livekitApiSecret,
  )
}

export async function startMeetRoomEgress({
  roomName,
  recordingId,
}: {
  roomName: string
  recordingId: string
}): Promise<MeetRecordingEgressResult> {
  const infrastructure = getMeetRecordingInfrastructure()
  if (!infrastructure) throw new Error(MEET_RECORDING_UNAVAILABLE_MESSAGE)

  const storageKey = buildMeetRecordingStorageKey(roomName, recordingId)
  const output = new EncodedFileOutput({
    filepath: storageKey,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: infrastructure.r2AccessKeyId,
        secret: infrastructure.r2SecretAccessKey,
        region: 'auto',
        endpoint: `https://${infrastructure.r2AccountId}.r2.cloudflarestorage.com`,
        bucket: infrastructure.r2BucketName,
        forcePathStyle: true,
      }),
    },
  })

  const egress = await getEgressClient(infrastructure).startRoomCompositeEgress(roomName, output, {
    layout: 'grid',
  })

  if (!egress.egressId) throw new Error(MEET_RECORDING_FAILURE_MESSAGE)

  return {
    egressId: egress.egressId,
    storageBucket: infrastructure.r2BucketName,
    storageKey,
  }
}

export async function stopMeetRoomEgress(egressId: string) {
  const infrastructure = getMeetRecordingInfrastructure()
  if (!infrastructure) throw new Error(MEET_RECORDING_UNAVAILABLE_MESSAGE)
  return getEgressClient(infrastructure).stopEgress(egressId)
}

function asSafeNumber(value: bigint) {
  const numberValue = Number(value)
  return Number.isSafeInteger(numberValue) && numberValue >= 0 ? numberValue : null
}

export function getMeetRecordingStatusFromEgress(egress: EgressInfo): MeetRecordingStatus {
  switch (egress.status) {
    case EgressStatus.EGRESS_ACTIVE:
      return 'recording'
    case EgressStatus.EGRESS_COMPLETE:
      return 'ready'
    case EgressStatus.EGRESS_FAILED:
    case EgressStatus.EGRESS_ABORTED:
    case EgressStatus.EGRESS_LIMIT_REACHED:
      return 'failed'
    case EgressStatus.EGRESS_ENDING:
      return 'processing'
    case EgressStatus.EGRESS_STARTING:
    default:
      return 'preparing'
  }
}

export function getMeetRecordingEgressUpdate(egress: EgressInfo) {
  const status = getMeetRecordingStatusFromEgress(egress)
  const file = egress.fileResults[0]

  return {
    status,
    ...(status === 'ready'
      ? {
          ended_at: new Date().toISOString(),
          file_size_bytes: file ? asSafeNumber(file.size) : null,
          duration_seconds: file ? asSafeNumber(file.duration) : null,
          error_message: null,
        }
      : {}),
    ...(status === 'failed'
      ? {
          ended_at: new Date().toISOString(),
          error_message: MEET_RECORDING_FAILURE_MESSAGE,
        }
      : {}),
  }
}

export async function refreshMeetRecordingFromEgress(row: MeetRecordingRow) {
  if (!row.egress_id || !isMeetRecordingInfrastructureConfigured()) return null

  const infrastructure = getMeetRecordingInfrastructure()
  if (!infrastructure) return null

  const egresses = await getEgressClient(infrastructure).listEgress({ egressId: row.egress_id })
  const egress = egresses[0]
  return egress ? getMeetRecordingEgressUpdate(egress) : null
}
