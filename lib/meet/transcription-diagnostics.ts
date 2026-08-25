import { logServerEvent } from '@/lib/logging/safe-logger'

export const MEET_TRANSCRIPTION_DIAGNOSTIC_STAGES = [
  'open_transcript_lookup',
  'livekit_participants_lookup',
  'livekit_participants_validation',
  'age_profiles_lookup',
  'age_verification_lookup',
  'age_validation',
  'transcript_insert',
  'consent_insert',
  'public_response',
] as const

export type MeetTranscriptionDiagnosticStage =
  (typeof MEET_TRANSCRIPTION_DIAGNOSTIC_STAGES)[number]

const SAFE_INTERNAL_CODE_PATTERN = /^(?:MEET_TRANSCRIPTION|LIVEKIT)_[A-Z0-9_]{1,80}$/
const SAFE_POSTGRES_CODE_PATTERN = /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/
const SAFE_LIVEKIT_CODES = new Set([
  'already_exists',
  'deadline_exceeded',
  'internal',
  'not_found',
  'permission_denied',
  'resource_exhausted',
  'unauthenticated',
  'unavailable',
  'unknown',
])
const UNKNOWN_FAILURE_CODE = 'MEET_TRANSCRIPTION_UNKNOWN_FAILURE'

export class MeetTranscriptionStageError extends Error {
  readonly stage: MeetTranscriptionDiagnosticStage
  readonly source: unknown

  constructor(stage: MeetTranscriptionDiagnosticStage, source: unknown) {
    super(
      source instanceof Error && SAFE_INTERNAL_CODE_PATTERN.test(source.message)
        ? source.message
        : 'MEET_TRANSCRIPTION_STAGE_FAILURE',
    )
    this.name = 'MeetTranscriptionStageError'
    this.stage = stage
    this.source = source
  }
}

export function asMeetTranscriptionStageError(
  stage: MeetTranscriptionDiagnosticStage,
  error: unknown,
) {
  return error instanceof MeetTranscriptionStageError
    ? error
    : new MeetTranscriptionStageError(stage, error)
}

function getSafeCodeCandidate(error: unknown) {
  if (!error || typeof error !== 'object') {
    return typeof error === 'string' ? error : null
  }

  const record = error as Record<string, unknown>
  if (typeof record.code === 'string' || typeof record.code === 'number') {
    return String(record.code)
  }
  return error instanceof Error ? error.message : null
}

export function normalizeMeetTranscriptionErrorCode(error: unknown) {
  const source = error instanceof MeetTranscriptionStageError ? error.source : error
  const candidate = getSafeCodeCandidate(source)?.trim() || ''

  if (
    SAFE_INTERNAL_CODE_PATTERN.test(candidate)
    || SAFE_POSTGRES_CODE_PATTERN.test(candidate)
    || SAFE_LIVEKIT_CODES.has(candidate)
  ) {
    return candidate
  }
  return UNKNOWN_FAILURE_CODE
}

export function logMeetTranscriptionFailure(
  fallbackStage: MeetTranscriptionDiagnosticStage,
  error: unknown,
) {
  const stage = error instanceof MeetTranscriptionStageError ? error.stage : fallbackStage
  logServerEvent('error', {
    event: 'meet.transcription_request_failed',
    context: {
      stage,
      code: normalizeMeetTranscriptionErrorCode(error),
    },
  })
}
