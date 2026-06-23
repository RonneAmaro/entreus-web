import {
  getMeetRecordingCompressionPolicy,
  getMeetRecordingRetention,
} from './recording-compression'

export type MeetRecordingEnvironment = Record<string, string | undefined>

export type MeetRecordingEnvironmentDiagnostics = {
  egressEnabled: boolean
  hasMeetRecordingsBucketName: boolean
  hasR2AccessConfig: boolean
  hasLiveKitServerConfig: boolean
  ready: boolean
  missing: string[]
  warnings: string[]
  storagePolicy: {
    compressionProfile: 'economy' | 'standard'
    compressionDescription: string
    storageUsage: string
    maxDurationSeconds: number
    maxExpectedFileSizeBytes: number
    retentionDays: number
    retentionWarning: string
  }
}

const R2_ACCESS_VARIABLES = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const
const LIVEKIT_SERVER_VARIABLES = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const

function hasConfiguredValue(environment: MeetRecordingEnvironment, variableName: string) {
  return typeof environment[variableName] === 'string' && environment[variableName].trim().length > 0
}

function getMissingVariables(
  environment: MeetRecordingEnvironment,
  variableNames: readonly string[],
) {
  return variableNames.filter((variableName) => !hasConfiguredValue(environment, variableName))
}

export function getMeetRecordingEnvironmentDiagnostics(
  environment: MeetRecordingEnvironment = process.env,
): MeetRecordingEnvironmentDiagnostics {
  const compressionPolicy = getMeetRecordingCompressionPolicy()
  const retention = getMeetRecordingRetention()
  const egressEnabled = environment.MEET_RECORDING_EGRESS_ENABLED?.trim().toLowerCase() === 'true'
  const hasMeetRecordingsBucketName = hasConfiguredValue(environment, 'R2_MEET_RECORDINGS_BUCKET_NAME')
  const missingR2 = getMissingVariables(environment, R2_ACCESS_VARIABLES)
  const missingLiveKit = getMissingVariables(environment, LIVEKIT_SERVER_VARIABLES)
  const hasR2AccessConfig = missingR2.length === 0
  const hasLiveKitServerConfig = missingLiveKit.length === 0
  const missing: string[] = []

  if (!egressEnabled) missing.push('MEET_RECORDING_EGRESS_ENABLED=true')
  if (!hasMeetRecordingsBucketName) missing.push('R2_MEET_RECORDINGS_BUCKET_NAME')
  missing.push(...missingR2, ...missingLiveKit)

  const ready = egressEnabled && hasMeetRecordingsBucketName && hasR2AccessConfig && hasLiveKitServerConfig
  const warnings: string[] = []

  if (egressEnabled && !ready) {
    warnings.push('A gravação continuará bloqueada até que todas as configurações obrigatórias estejam presentes.')
  }

  if (ready) {
    warnings.push('Confirme manualmente a migration Supabase, a privacidade do bucket R2 e o suporte a Egress antes de liberar a gravação.')
  }

  return {
    egressEnabled,
    hasMeetRecordingsBucketName,
    hasR2AccessConfig,
    hasLiveKitServerConfig,
    ready,
    missing,
    warnings,
    storagePolicy: {
      compressionProfile: compressionPolicy.profile,
      compressionDescription: compressionPolicy.description,
      storageUsage: compressionPolicy.storageUsage,
      maxDurationSeconds: compressionPolicy.limits.maxDurationSeconds,
      maxExpectedFileSizeBytes: compressionPolicy.limits.maxExpectedFileSizeBytes,
      retentionDays: retention.retentionDays,
      retentionWarning: retention.warning,
    },
  }
}

export function toSafeMeetRecordingDiagnosticsPayload(
  diagnostics: MeetRecordingEnvironmentDiagnostics,
) {
  return {
    ready: diagnostics.ready,
    egressEnabled: diagnostics.egressEnabled,
    hasMeetRecordingsBucketName: diagnostics.hasMeetRecordingsBucketName,
    hasR2AccessConfig: diagnostics.hasR2AccessConfig,
    hasLiveKitServerConfig: diagnostics.hasLiveKitServerConfig,
    missing: diagnostics.missing,
    warnings: diagnostics.warnings,
    storagePolicy: diagnostics.storagePolicy,
  }
}
