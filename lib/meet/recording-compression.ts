export const MEET_RECORDING_COMPRESSION_PROFILES = ['economy', 'standard'] as const

export type MeetRecordingCompressionProfile =
  (typeof MEET_RECORDING_COMPRESSION_PROFILES)[number]

export const DEFAULT_MEET_RECORDING_COMPRESSION_PROFILE: MeetRecordingCompressionProfile = 'economy'

export const MEET_RECORDING_DEFAULT_MAX_DURATION_SECONDS = 60 * 60
export const MEET_RECORDING_RETENTION_DAYS = 15
export const MEET_RECORDING_RETENTION_MS = MEET_RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000

const MEBIBYTE = 1024 * 1024

type MeetRecordingEncodingConfig = {
  width: number
  height: number
  framerate: number
  videoBitrateKbps: number
  audioBitrateKbps: number
  audioFrequency: number
}

export type MeetRecordingCompressionPolicy = {
  profile: MeetRecordingCompressionProfile
  description: string
  storageUsage: string
  limits: {
    maxDurationSeconds: number
    maxExpectedFileSizeBytes: number
    estimatedFileSizeBytes: number
  }
  warnings: string[]
  serverEncoding: MeetRecordingEncodingConfig
}

export type MeetRecordingPlanLimits = {
  plan: 'free' | 'vip' | 'admin'
  canStartRecording: boolean
  compressionProfile: MeetRecordingCompressionProfile
  maxDurationSeconds: number
  maxExpectedFileSizeBytes: number
  warning: string
}

const POLICIES: Record<MeetRecordingCompressionProfile, MeetRecordingCompressionPolicy> = {
  economy: {
    profile: 'economy',
    description: 'Qualidade equilibrada para reuniões e aulas, com prioridade para economia de armazenamento.',
    storageUsage: 'Baixo para vídeo composto de reunião; estimativa de cerca de 500 MB por hora.',
    limits: {
      maxDurationSeconds: MEET_RECORDING_DEFAULT_MAX_DURATION_SECONDS,
      maxExpectedFileSizeBytes: 600 * MEBIBYTE,
      estimatedFileSizeBytes: 500 * MEBIBYTE,
    },
    warnings: [
      'Gravações acima de 60 minutos podem ser recusadas ou ficar indisponíveis para download.',
      'O tamanho final varia conforme participantes, compartilhamento de tela e conteúdo exibido.',
    ],
    serverEncoding: {
      width: 960,
      height: 540,
      framerate: 20,
      videoBitrateKbps: 1100,
      audioBitrateKbps: 64,
      audioFrequency: 48000,
    },
  },
  standard: {
    profile: 'standard',
    description: 'Qualidade intermediária para casos aprovados, ainda submetida a limite de tamanho.',
    storageUsage: 'Médio; estimativa de cerca de 900 MB por hora.',
    limits: {
      maxDurationSeconds: MEET_RECORDING_DEFAULT_MAX_DURATION_SECONDS,
      maxExpectedFileSizeBytes: 1024 * MEBIBYTE,
      estimatedFileSizeBytes: 900 * MEBIBYTE,
    },
    warnings: [
      'Este perfil não fica disponível para escolha pública nesta fase.',
      'Gravações acima de 60 minutos podem ser recusadas ou ficar indisponíveis para download.',
    ],
    serverEncoding: {
      width: 1280,
      height: 720,
      framerate: 24,
      videoBitrateKbps: 2000,
      audioBitrateKbps: 96,
      audioFrequency: 48000,
    },
  },
}

export function isMeetRecordingCompressionProfile(
  value: unknown,
): value is MeetRecordingCompressionProfile {
  return (
    typeof value === 'string' &&
    (MEET_RECORDING_COMPRESSION_PROFILES as readonly string[]).includes(value)
  )
}

export function resolveMeetRecordingCompressionProfile(
  value: unknown,
): MeetRecordingCompressionProfile {
  return isMeetRecordingCompressionProfile(value)
    ? value
    : DEFAULT_MEET_RECORDING_COMPRESSION_PROFILE
}

export function getMeetRecordingCompressionPolicy(
  profile: unknown = DEFAULT_MEET_RECORDING_COMPRESSION_PROFILE,
): MeetRecordingCompressionPolicy {
  return POLICIES[resolveMeetRecordingCompressionProfile(profile)]
}

export function getMeetRecordingPlanLimits({
  isVipActive,
  isPlatformAdmin,
}: {
  isVipActive: boolean
  isPlatformAdmin: boolean
}): MeetRecordingPlanLimits {
  const policy = getMeetRecordingCompressionPolicy()

  if (isPlatformAdmin) {
    return {
      plan: 'admin',
      canStartRecording: true,
      compressionProfile: policy.profile,
      maxDurationSeconds: policy.limits.maxDurationSeconds,
      maxExpectedFileSizeBytes: policy.limits.maxExpectedFileSizeBytes,
      warning: 'Teste administrativo permitido somente com os mesmos limites econômicos e consentimento.',
    }
  }

  if (isVipActive) {
    return {
      plan: 'vip',
      canStartRecording: true,
      compressionProfile: policy.profile,
      maxDurationSeconds: policy.limits.maxDurationSeconds,
      maxExpectedFileSizeBytes: policy.limits.maxExpectedFileSizeBytes,
      warning: 'A gravação VIP usa o perfil econômico e permanece sujeita aos limites de duração e tamanho.',
    }
  }

  return {
    plan: 'free',
    canStartRecording: false,
    compressionProfile: policy.profile,
    maxDurationSeconds: policy.limits.maxDurationSeconds,
    maxExpectedFileSizeBytes: policy.limits.maxExpectedFileSizeBytes,
    warning: 'Contas gratuitas não podem iniciar gravação real.',
  }
}

export function getMeetRecordingRetention(now: Date = new Date()) {
  return {
    retentionDays: MEET_RECORDING_RETENTION_DAYS,
    retentionExpiresAt: new Date(now.getTime() + MEET_RECORDING_RETENTION_MS).toISOString(),
    warning: `Downloads ficam disponíveis por até ${MEET_RECORDING_RETENTION_DAYS} dias; a exclusão física automática será adicionada em pacote futuro.`,
  }
}

export function hasActiveMeetRecordingRetention(
  retentionExpiresAt: string | null | undefined,
  now: Date = new Date(),
) {
  if (!retentionExpiresAt) return false
  const expiresAt = Date.parse(retentionExpiresAt)
  return Number.isFinite(expiresAt) && expiresAt > now.getTime()
}

export function isWithinMeetRecordingLimits({
  durationSeconds,
  fileSizeBytes,
  profile,
}: {
  durationSeconds: number | null
  fileSizeBytes: number | null
  profile: unknown
}) {
  const limits = getMeetRecordingCompressionPolicy(profile).limits
  return (
    (durationSeconds === null || durationSeconds <= limits.maxDurationSeconds) &&
    (fileSizeBytes === null || fileSizeBytes <= limits.maxExpectedFileSizeBytes)
  )
}
