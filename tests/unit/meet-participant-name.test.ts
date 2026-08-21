import { describe, expect, it } from 'vitest'
import {
  createMeetingNameFieldState,
  createServerIssuedLiveKitIdentity,
  editMeetingName,
  initializeMeetingName,
  validateMeetingParticipantName,
} from '@/lib/meet/participant-name'

describe('Meet participant display name', () => {
  it('prefills the account name once', () => {
    const initial = createMeetingNameFieldState()
    expect(initializeMeetingName(initial, 'Ronne Amaro Oficial')).toEqual({
      value: 'Ronne Amaro Oficial',
      initialized: true,
      edited: false,
    })
  })

  it('keeps the user alias through rerenders and later profile updates', () => {
    const prefilled = initializeMeetingName(createMeetingNameFieldState(), 'Ronne Amaro Oficial')
    const edited = editMeetingName(prefilled, 'Ronne')

    expect(initializeMeetingName(edited, 'Novo Nome do Perfil')).toBe(edited)
    expect(edited.value).toBe('Ronne')
  })

  it('does not repopulate after the user clears the field or starts typing again', () => {
    const prefilled = initializeMeetingName(createMeetingNameFieldState(), 'Ronne Amaro Oficial')
    const cleared = editMeetingName(prefilled, '')
    const afterProfileRefresh = initializeMeetingName(cleared, 'Ronne Amaro Oficial')
    const typing = editMeetingName(afterProfileRefresh, 'Ro')

    expect(afterProfileRefresh.value).toBe('')
    expect(typing.value).toBe('Ro')
  })

  it('normalizes whitespace and validates empty, long and markup values consistently', () => {
    expect(validateMeetingParticipantName('  Ronne   Meet  ')).toEqual({ ok: true, value: 'Ronne Meet' })
    expect(validateMeetingParticipantName('   ')).toMatchObject({ ok: false, code: 'empty' })
    expect(validateMeetingParticipantName('A'.repeat(61))).toMatchObject({ ok: false, code: 'too_long' })
    expect(validateMeetingParticipantName('<script>alert(1)</script>')).toMatchObject({
      ok: false,
      code: 'unsafe_characters',
    })
  })

  it('keeps LiveKit identity server-issued and independent from duplicate display names', () => {
    const first = createServerIssuedLiveKitIdentity('user-uuid', '11111111-aaaa-bbbb-cccc-111111111111')
    const second = createServerIssuedLiveKitIdentity('user-uuid', '22222222-aaaa-bbbb-cccc-222222222222')

    expect(first).toBe('user-uuid-11111111')
    expect(second).toBe('user-uuid-22222222')
    expect(first).not.toBe(second)
    expect(first).not.toContain('Ronne')
  })
})
