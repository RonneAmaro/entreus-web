import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Meet functional local layouts', () => {
  const source = readFileSync('app/meet/[roomName]/MeetRoomClient.tsx', 'utf8')

  it('exposes Automático, Grade, Destaque and Apresentação from the existing Layout control', () => {
    expect(source).toContain('aria-label="Layout"')
    expect(source).toContain("mode: 'auto', label: 'Automático'")
    expect(source).toContain("mode: 'grid', label: 'Grade'")
    expect(source).toContain("mode: 'focus', label: 'Destaque'")
    expect(source).toContain("mode: 'presentation', label: 'Apresentação'")
    expect(source).toContain('role="radiogroup"')
  })

  it('persists only local layout state without room, connection or track mutation', () => {
    const selectStart = source.indexOf('function selectMeetLayout')
    const selectEnd = source.indexOf('async function confirmEndMeeting', selectStart)
    const selectSource = source.slice(selectStart, selectEnd)
    expect(selectSource).toContain('setLayoutMode(nextMode)')
    expect(selectSource).toContain('writeMeetLayoutMode(getMeetPreferenceStorage(), nextMode)')
    expect(selectSource).not.toMatch(/fetch|supabase|disconnect|connect|publish|subscribe|token/i)
  })

  it('renders responsive participant tracks in Grade', () => {
    expect(source).toContain('data-meet-layout="grid"')
    expect(source).toContain('<GridLayout')
    expect(source).toContain('tracks={tracks}')
    expect(source).toContain('overflow-hidden')
  })

  it('renders a focused participant and preserves deliberate local focus', () => {
    expect(source).toContain("resolvedLayout === 'focus' && focusedTrack")
    expect(source).toContain('<FocusLayout trackRef={focusedTrack}')
    expect(source).toContain('setFocusedParticipantIdentity(event.participant.identity)')
    expect(source).toContain('Foco automático')
    expect(source).toContain('manuallyFocusedTrack ?? activeSpeakerTrack')
  })

  it('prioritizes an existing presentation with participant carousel', () => {
    expect(source).toContain("resolvedLayout === 'presentation' && activePresentationTrack")
    expect(source).toContain('<FocusLayout trackRef={activePresentationTrack}')
    expect(source).toContain('<CarouselLayout tracks={cameraTracks}')
  })

  it('keeps captions mounted outside every visual layout branch', () => {
    const captionsPanel = source.indexOf('<MeetCaptionsPanel')
    const layoutBranch = source.indexOf("resolvedLayout === 'presentation'", captionsPanel)
    expect(captionsPanel).toBeGreaterThan(-1)
    expect(layoutBranch).toBeGreaterThan(captionsPanel)
  })

  it('keeps layout reachable in the bounded mobile options sheet', () => {
    expect(source).toContain('left-3 right-3')
    expect(source).toContain('max-h-[min(78vh,42rem)]')
    expect(source).toContain('aria-controls="meet-layout-options"')
    expect(source).toContain('max-[359px]:hidden')
  })
})
