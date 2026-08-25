import { describe, expect, it } from 'vitest'
import {
  MEET_TRANSCRIPTION_DIAGNOSTIC_STAGES,
  normalizeMeetTranscriptionErrorCode,
} from '@/lib/meet/transcription-diagnostics'

describe('Meet transcription safe diagnostics', () => {
  it('keeps the POST failure stages narrow and explicit', () => {
    expect(MEET_TRANSCRIPTION_DIAGNOSTIC_STAGES).toEqual([
      'open_transcript_lookup',
      'livekit_participants_lookup',
      'livekit_participants_validation',
      'age_profiles_lookup',
      'age_verification_lookup',
      'age_validation',
      'transcript_insert',
      'consent_insert',
      'public_response',
    ])
  })

  it('allowlists only normalized infrastructure codes and rejects raw messages', () => {
    expect(normalizeMeetTranscriptionErrorCode({ code: '23505' })).toBe('23505')
    expect(normalizeMeetTranscriptionErrorCode({ code: 'PGRST116' })).toBe('PGRST116')
    expect(normalizeMeetTranscriptionErrorCode(
      new Error('MEET_TRANSCRIPTION_UNATTRIBUTED_PARTICIPANT'),
    )).toBe('MEET_TRANSCRIPTION_UNATTRIBUTED_PARTICIPANT')
    expect(normalizeMeetTranscriptionErrorCode({
      code: 'user-a born 1990-01-01 with secret-value',
    })).toBe('MEET_TRANSCRIPTION_UNKNOWN_FAILURE')
    expect(normalizeMeetTranscriptionErrorCode(
      new Error('raw transcript text and private database details'),
    )).toBe('MEET_TRANSCRIPTION_UNKNOWN_FAILURE')
  })
})
