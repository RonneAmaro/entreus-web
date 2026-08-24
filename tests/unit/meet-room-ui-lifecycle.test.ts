import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  getMeetLeaveAction,
  isMeetRoomFinal,
  shouldRunMeetCountdown,
} from '@/lib/meet/room-ui-lifecycle'

describe('Meet room lifecycle UI', () => {
  it('shows regular participants the non-destructive leave action', () => {
    expect(getMeetLeaveAction(false)).toEqual({
      label: 'Sair da reunião',
      title: 'Sair da reunião',
      requiresConfirmation: false,
    })
  })

  it('shows the owner an explicit end-for-everyone action', () => {
    expect(getMeetLeaveAction(true)).toEqual({
      label: 'Encerrar reunião',
      title: 'Encerrar reunião para todos',
      requiresConfirmation: true,
    })
  })

  it('runs the counter only while the room is active', () => {
    expect(shouldRunMeetCountdown('active')).toBe(true)
    expect(shouldRunMeetCountdown('ended')).toBe(false)
    expect(shouldRunMeetCountdown('expired')).toBe(false)
    expect(isMeetRoomFinal('ended')).toBe(true)
    expect(isMeetRoomFinal('expired')).toBe(true)
  })

  it('wires confirmation, cancellation and successful ended state in the client', () => {
    const source = readFileSync('app/meet/[roomName]/MeetRoomClient.tsx', 'utf8')
    expect(source).toContain('Encerrar a reunião para todos os participantes?')
    expect(source).toContain('onClick={() => setShowEndConfirmation(false)}')
    expect(source).toContain("setRoomData((current) => current ? { ...current, status: 'ended' } : current)")
    expect(source).toContain('/end`')
  })

  it('uses explicit low-frequency lifecycle reconciliation instead of every status poll', () => {
    const source = readFileSync('app/meet/[roomName]/MeetRoomClient.tsx', 'utf8')
    expect(source).toContain("reconcile ? '?reconcile=1' : ''")
    expect(source).toContain('loadRoom(true), 30_000')
    expect(source).toContain('void loadRoom(true)')
  })
})
