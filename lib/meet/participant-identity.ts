import type { MeetMember, MeetRoom } from '@/lib/meet-server'

export const ENTREUS_LIVEKIT_ATTRIBUTES = {
  userId: 'entreus.user_id',
  memberId: 'entreus.member_id',
  roomId: 'entreus.room_id',
  role: 'entreus.role',
} as const

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

export function validateServerIssuedParticipantIdentity(input: {
  identity: string
  attributes?: Record<string, string> | null
  roomId: string
  member: Pick<MeetMember, 'id' | 'user_id' | 'room_id' | 'role' | 'status'>
}) {
  if (input.member.room_id !== input.roomId) return false
  const identityPrefix = `${input.member.user_id}-`
  const expectedAttributes = createServerIssuedParticipantAttributes(
    { id: input.roomId },
    input.member,
  )

  if (
    input.member.status !== 'approved'
    || !input.identity.startsWith(identityPrefix)
    || !/^[0-9a-f]{8}$/i.test(input.identity.slice(identityPrefix.length))
  ) return false

  return Object.entries(expectedAttributes).every(
    ([key, value]) => input.attributes?.[key] === value,
  )
}
