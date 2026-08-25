import type { MeetMember, MeetRoom } from '@/lib/meet-server'

export const ENTREUS_LIVEKIT_ATTRIBUTES = {
  userId: 'entreus.user_id',
  memberId: 'entreus.member_id',
  roomId: 'entreus.room_id',
  role: 'entreus.role',
} as const

const SERVER_ISSUED_PARTICIPANT_IDENTITY_PATTERN =
  /^([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})-([0-9a-f]{8})$/i

export type EntreUSParticipantAttributes = Record<
  (typeof ENTREUS_LIVEKIT_ATTRIBUTES)[keyof typeof ENTREUS_LIVEKIT_ATTRIBUTES],
  string
>

export function createServerIssuedParticipantAttributes(
  room: Pick<MeetRoom, 'id'>,
  member: Pick<MeetMember, 'id' | 'user_id' | 'room_id' | 'role'>,
): EntreUSParticipantAttributes {
  if (member.room_id !== room.id) {
    throw new Error('MEET_PARTICIPANT_ROOM_MISMATCH')
  }

  return {
    [ENTREUS_LIVEKIT_ATTRIBUTES.userId]: member.user_id,
    [ENTREUS_LIVEKIT_ATTRIBUTES.memberId]: member.id,
    [ENTREUS_LIVEKIT_ATTRIBUTES.roomId]: room.id,
    [ENTREUS_LIVEKIT_ATTRIBUTES.role]: member.role,
  }
}

export function parseServerIssuedParticipantIdentity(identity: string) {
  const match = SERVER_ISSUED_PARTICIPANT_IDENTITY_PATTERN.exec(identity)
  if (!match) return null
  return { userId: match[1].toLowerCase(), nonce: match[2].toLowerCase() }
}

export function hasEntreUSParticipantAttributes(
  attributes?: Record<string, string> | null,
) {
  return Object.values(ENTREUS_LIVEKIT_ATTRIBUTES).some(
    (key) => Object.prototype.hasOwnProperty.call(attributes ?? {}, key),
  )
}

export function validateServerIssuedParticipantIdentity(input: {
  identity: string
  attributes?: Record<string, string> | null
  roomId: string
  member: Pick<MeetMember, 'id' | 'user_id' | 'room_id' | 'role' | 'status'>
}) {
  if (input.member.room_id !== input.roomId) return false
  const parsedIdentity = parseServerIssuedParticipantIdentity(input.identity)
  if (!parsedIdentity || parsedIdentity.userId !== input.member.user_id.toLowerCase()) return false
  const expectedAttributes = createServerIssuedParticipantAttributes(
    { id: input.roomId },
    input.member,
  )

  if (input.member.status !== 'approved') return false

  return Object.entries(expectedAttributes).every(
    ([key, value]) => input.attributes?.[key] === value,
  )
}
