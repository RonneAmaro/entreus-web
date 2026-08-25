import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isTrustedCaptionPublisher } from '@/lib/meet/caption-source'

describe('Meet personal live captions UI', () => {
  const panelSource = readFileSync('app/meet/[roomName]/MeetCaptionsPanel.tsx', 'utf8')
  const roomSource = readFileSync('app/meet/[roomName]/MeetRoomClient.tsx', 'utf8')

  it('shows one unconditional personal Legendas control to moderators and ordinary participants', () => {
    expect(roomSource).toContain('aria-label="Legendas"')
    expect(roomSource.match(/aria-label="Legendas"/g)).toHaveLength(1)
    const captionsControl = roomSource.slice(
      roomSource.indexOf('onClick={togglePersonalCaptions}'),
      roomSource.indexOf('onClick={togglePersonalCaptions}') + 900,
    )
    expect(captionsControl).not.toContain('isModerator')
    expect(captionsControl).not.toContain('isOwner')
  })

  it('places the icon-only control in the bottom toolbar and removes the top-right control', () => {
    const toolbarStart = roomSource.indexOf('absolute inset-x-0 bottom-3')
    const captionsControl = roomSource.indexOf('onClick={togglePersonalCaptions}')
    const moreControl = roomSource.indexOf('toggleMoreOptionsPanel()', captionsControl)
    expect(toolbarStart).toBeGreaterThan(-1)
    expect(captionsControl).toBeGreaterThan(toolbarStart)
    expect(captionsControl).toBeLessThan(moreControl)
    expect(panelSource).not.toContain('<button')
  })

  it('uses an honest unavailable state without green or active success language', () => {
    expect(panelSource).toContain('Legendas indisponíveis')
    expect(panelSource).toContain('O serviço de reconhecimento de fala ainda não está configurado.')
    expect(panelSource).not.toContain('Legendas ativadas')
    expect(panelSource).not.toMatch(/emerald|green/)
    expect(roomSource).toContain("captionState === 'unavailable'")
    expect(roomSource).toContain('data-caption-state={captionState}')
  })

  it('uses only local preference helpers and no transcript or consent request', () => {
    const toggleStart = roomSource.indexOf('function togglePersonalCaptions()')
    const toggleEnd = roomSource.indexOf('function selectMeetLayout', toggleStart)
    const toggleSource = roomSource.slice(toggleStart, toggleEnd)
    expect(toggleSource).toContain('setCaptionMode(nextMode)')
    expect(toggleSource).toContain('writeMeetCaptionMode(getMeetPreferenceStorage(), nextMode)')
    expect(toggleSource).not.toContain('fetch(')
    expect(toggleSource).not.toContain('supabase')
    expect(toggleSource).not.toContain('/transcription')
    expect(panelSource).not.toContain('fetch(')
    expect(panelSource).not.toContain('Solicitar legendas')
    expect(panelSource).not.toContain('Todos consentiram')
    expect(panelSource).not.toContain('Consentimentos concluídos')
  })

  it('renders streams only in the genuinely on state and keeps stable segments', () => {
    expect(panelSource).toContain("if (captionState !== 'on') return []")
    expect(panelSource).toContain("captionState === 'on' && captionLines.length > 0")
    expect(panelSource).toContain('actualPublisherIdentity: stream.participantInfo.identity')
    expect(panelSource).toContain('trustedPublisherIdentity,')
    expect(panelSource).toContain("'lk.segment_id'")
    expect(panelSource).toContain('bySegment.set(segmentId, stream)')
  })

  it('keeps a narrow future worker demand boundary without adding a provider', () => {
    expect(panelSource).toContain('export type MeetCaptionDemand')
    expect(panelSource).toContain('onCaptionDemandChange?.({ enabled: captionsRequested, mode: captionMode })')
    expect(roomSource).toContain('const trustedCaptionPublisherIdentity: string | null = null')
  })

  it('keeps chat, audio, video, participants, hand, attachments and recording available', () => {
    expect(roomSource).toContain('source={Track.Source.Microphone}')
    expect(roomSource).toContain('source={Track.Source.Camera}')
    expect(roomSource).toContain('aria-label="Bate-papo"')
    expect(roomSource).toContain("openPanel('participants')")
    expect(roomSource).toContain('onClick={onToggleHand}')
    expect(roomSource).toContain('aria-label="Enviar anexo"')
    expect(roomSource).toContain('toggleRecordingControl')
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
