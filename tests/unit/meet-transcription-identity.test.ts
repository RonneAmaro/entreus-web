import { describe, expect, it } from 'vitest'
import {
  ENTREUS_LIVEKIT_ATTRIBUTES,
  createServerIssuedParticipantAttributes,
  validateServerIssuedParticipantIdentity,
} from '@/lib/meet/participant-identity'

const member = {
  id: 'member-a',
  room_id: 'room-a',
  user_id: '11111111-1111-4111-8111-111111111111',
  role: 'participant' as const,
  status: 'approved' as const,
}

describe('Meet server-issued participant attribution', () => {
  it('creates stable room, member, user and role attributes without client input', () => {
    expect(createServerIssuedParticipantAttributes({ id: 'room-a' }, member)).toEqual({
      [ENTREUS_LIVEKIT_ATTRIBUTES.userId]: member.user_id,
      [ENTREUS_LIVEKIT_ATTRIBUTES.memberId]: member.id,
      [ENTREUS_LIVEKIT_ATTRIBUTES.roomId]: member.room_id,
      [ENTREUS_LIVEKIT_ATTRIBUTES.role]: member.role,
    })
  })

  it('rejects cross-room attributes, forged roles and forged LiveKit identities', () => {
    const attributes = createServerIssuedParticipantAttributes({ id: 'room-a' }, member)
    const valid = {
      identity: `${member.user_id}-a1b2c3d4`,
      attributes,
      roomId: 'room-a',
      member,
    }
    expect(validateServerIssuedParticipantIdentity(valid)).toBe(true)
    expect(validateServerIssuedParticipantIdentity({ ...valid, roomId: 'room-b' })).toBe(false)
    expect(validateServerIssuedParticipantIdentity({
      ...valid,
      identity: `${member.user_id}-forgedxx`,
    })).toBe(false)
    expect(validateServerIssuedParticipantIdentity({
      ...valid,
      attributes: { ...attributes, [ENTREUS_LIVEKIT_ATTRIBUTES.role]: 'owner' },
    })).toBe(false)
  })

  it('refuses to issue attributes for a member from another room', () => {
    expect(() => createServerIssuedParticipantAttributes({ id: 'room-b' }, member))
      .toThrow('MEET_PARTICIPANT_ROOM_MISMATCH')
  })
})
