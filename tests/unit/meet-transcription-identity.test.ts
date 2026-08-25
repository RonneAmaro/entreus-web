import { describe, expect, it } from 'vitest'
import { AccessToken, ParticipantInfo, TokenVerifier } from 'livekit-server-sdk'
import {
  ENTREUS_LIVEKIT_ATTRIBUTES,
  createServerIssuedParticipantAttributes,
  parseServerIssuedParticipantIdentity,
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
  it('places all EntreUS participant attributes in the JWT produced by the installed SDK', async () => {
    const expectedAttributes = createServerIssuedParticipantAttributes({ id: 'room-a' }, member)
    const token = new AccessToken('fixture-key', 'fixture-secret', {
      identity: `${member.user_id}-a1b2c3d4`,
      name: 'Fixture',
      ttl: 60,
      attributes: expectedAttributes,
    })
    token.addGrant({ roomJoin: true, room: 'fixture-room' })

    const claims = await new TokenVerifier('fixture-key', 'fixture-secret')
      .verify(await token.toJwt())
    expect(Object.keys(claims.attributes ?? {}).sort()).toEqual(
      Object.values(ENTREUS_LIVEKIT_ATTRIBUTES).sort(),
    )
    expect(claims.attributes).toEqual(expectedAttributes)
  })

  it('preserves participant attributes through the installed ParticipantInfo JSON mapping', () => {
    const expectedAttributes = createServerIssuedParticipantAttributes({ id: 'room-a' }, member)
    const encoded = new ParticipantInfo({
      identity: `${member.user_id}-a1b2c3d4`,
      attributes: expectedAttributes,
    }).toJson()
    const decoded = ParticipantInfo.fromJson(encoded, { ignoreUnknownFields: true })

    expect(Object.keys(decoded.attributes).sort()).toEqual(
      Object.values(ENTREUS_LIVEKIT_ATTRIBUTES).sort(),
    )
    expect(decoded.attributes).toEqual(expectedAttributes)
  })

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

  it('parses only a canonical UUID plus an eight-hex server nonce', () => {
    expect(parseServerIssuedParticipantIdentity(`${member.user_id}-a1b2c3d4`)).toEqual({
      userId: member.user_id,
      nonce: 'a1b2c3d4',
    })
    expect(parseServerIssuedParticipantIdentity(`${member.user_id}-nothex!!`)).toBeNull()
    expect(parseServerIssuedParticipantIdentity('user-a-a1b2c3d4')).toBeNull()
    expect(parseServerIssuedParticipantIdentity(`${member.user_id}-a1b2c3d4-extra`)).toBeNull()
  })

  it('refuses to issue attributes for a member from another room', () => {
    expect(() => createServerIssuedParticipantAttributes({ id: 'room-b' }, member))
      .toThrow('MEET_PARTICIPANT_ROOM_MISMATCH')
  })
})
