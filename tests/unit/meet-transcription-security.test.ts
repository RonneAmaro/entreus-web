import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Meet transcription privacy boundary', () => {
  it('exposes no browser segment-write route or client-side transcript persistence', () => {
    expect(existsSync('app/api/meet/rooms/[roomName]/transcription/segments/route.ts')).toBe(false)
    const panel = readFileSync('app/meet/[roomName]/MeetCaptionsPanel.tsx', 'utf8')
    expect(panel).not.toContain('meet_transcript_segments')
    expect(panel).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(panel).not.toContain('LIVEKIT_API_SECRET')
    expect(panel).not.toContain('/transcription')
    expect(panel).not.toContain('fetch(')
  })

  it('does not send transcript text to logs or error payloads', () => {
    const sources = [
      'lib/meet/transcription-server.ts',
      'app/api/meet/rooms/[roomName]/transcription/route.ts',
      'app/api/meet/rooms/[roomName]/transcription/consent/route.ts',
    ].map((path) => readFileSync(path, 'utf8')).join('\n')
    expect(sources).not.toMatch(/console\.(log|info|warn|error)/)
    expect(sources).not.toContain('logServerEvent')
    expect(sources).not.toMatch(/jsonError\([^\n]*(original_text|input\.text|text\s*[,}])/)

    const diagnostics = readFileSync('lib/meet/transcription-diagnostics.ts', 'utf8')
    expect(diagnostics).not.toMatch(/console\.(log|info|warn|error)/)
    expect(diagnostics).toContain("event: 'meet.transcription_request_failed'")
    expect(diagnostics).toContain('normalizeMeetTranscriptionErrorCode(error)')
    expect(diagnostics).not.toMatch(/roomName|userId|memberId|participantIdentity|birthDate/)
  })

  it('keeps provider credentials and provider choice out of Phase 1 source', () => {
    const sources = [
      'lib/meet/transcription-server.ts',
      'app/api/meet/rooms/[roomName]/transcription/route.ts',
    ].map((path) => readFileSync(path, 'utf8')).join('\n')
    expect(sources).not.toMatch(/(openai|deepgram|assemblyai|google|azure|aws)[_-]?(api|key|secret)/i)
    expect(sources).not.toMatch(/process\.env\.[A-Z0-9_]*STT/)
  })
})
