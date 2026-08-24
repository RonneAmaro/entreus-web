import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isTrustedCaptionPublisher } from '@/lib/meet/caption-source'

describe('Meet transcription UI foundation', () => {
  const source = readFileSync('app/meet/[roomName]/MeetTranscriptionPanel.tsx', 'utf8')

  it('uses the actual LiveKit text-stream publisher and replaces segments by stable segment id', () => {
    expect(source).toContain("useTextStream(TRANSCRIPTION_TOPIC)")
    expect(source).toContain('actualPublisherIdentity: stream.participantInfo.identity')
    expect(source).toContain('trustedPublisherIdentity: transcript?.trustedPublisherIdentity ?? null')
    expect(source).toContain("'lk.segment_id'")
    expect(source).toContain('bySegment.set(segmentId, stream)')
    expect(source).toContain("'lk.transcribed_track_id'")
  })

  it('shows separate explicit consent and does not upload microphone audio or transcript text', () => {
    expect(source).toContain('Autorizar transcrição?')
    expect(source).toContain('Este consentimento é separado da gravação')
    expect(source).toContain("{ action: 'accept' }")
    expect(source).toContain("{ action: 'revoke' }")
    expect(source).not.toContain('getUserMedia')
    expect(source).not.toContain('original_text')
  })

  it('states honestly that STT is unavailable while preserving the meeting', () => {
    expect(source).toContain('O serviço de reconhecimento de fala ainda não está configurado')
    expect(source).toContain('a chamada continua normalmente')
  })

  it('rejects arbitrary participants and accepts only the configured actual agent publisher', () => {
    const participants = [
      { identity: 'user-a-deadbeef', isAgent: false },
      { identity: 'trusted-agent', isAgent: true },
    ]
    expect(isTrustedCaptionPublisher({
      actualPublisherIdentity: 'user-a-deadbeef',
      trustedPublisherIdentity: null,
      participants,
    })).toBe(false)
    expect(isTrustedCaptionPublisher({
      actualPublisherIdentity: 'user-a-deadbeef',
      trustedPublisherIdentity: 'trusted-agent',
      participants,
    })).toBe(false)
    expect(isTrustedCaptionPublisher({
      actualPublisherIdentity: 'trusted-agent',
      trustedPublisherIdentity: 'trusted-agent',
      participants,
    })).toBe(true)
  })
})
