import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import {
  ENTREUS_LIVEKIT_ATTRIBUTES,
  createServerIssuedParticipantAttributes,
} from '@/lib/meet/participant-identity'
import {
  evaluateTranscriptionAge,
  getTranscriptRetentionExpiry,
  hasMeetTranscriptExpired,
  listValidatedConnectedParticipants,
  persistFinalTranscriptSegment,
} from '@/lib/meet/transcription-server'

const userId = '11111111-1111-4111-8111-111111111111'
const identity = `${userId}-a1b2c3d4`
const attributes = {
  [ENTREUS_LIVEKIT_ATTRIBUTES.userId]: userId,
  [ENTREUS_LIVEKIT_ATTRIBUTES.memberId]: 'member-a',
  [ENTREUS_LIVEKIT_ATTRIBUTES.roomId]: 'room-a',
  [ENTREUS_LIVEKIT_ATTRIBUTES.role]: 'participant',
}

function createParticipantMembershipDatabase(rows: Array<Record<string, unknown>>) {
  const from = vi.fn(() => {
    let filtered = [...rows]
    const builder: Record<string, unknown> & PromiseLike<{
      data: Array<Record<string, unknown>>
      error: null
    }> = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filtered = filtered.filter((row) => row[column] === value)
        return builder
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        filtered = filtered.filter((row) => values.includes(row[column]))
        return builder
      }),
      then: (resolve, reject) => Promise.resolve({ data: filtered, error: null }).then(resolve, reject),
    }
    return builder
  })
  return { from } as unknown as SupabaseClient
}

function participantMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    room_id: 'room-a',
    user_id: userId,
    role: 'participant',
    status: 'approved',
    display_name: 'Fixture',
    ...overrides,
  }
}

function connectedParticipant(overrides: Record<string, unknown> = {}) {
  const member = participantMembership() as never
  return {
    identity,
    kind: 0,
    attributes: createServerIssuedParticipantAttributes({ id: 'room-a' }, member),
    ...overrides,
  }
}

function participantService(participant: ReturnType<typeof connectedParticipant>) {
  return {
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    deleteRoom: vi.fn(),
    listParticipants: vi.fn(async () => [participant]),
  }
}

function createSegmentDatabase(overrides: {
  transcriptStatus?: string
  transcriptRetentionExpiresAt?: string
  roomStatus?: string
  memberStatus?: string
  consentRevokedAt?: string | null
} = {}) {
  const inserted: unknown[] = []
  const rows: Record<string, Record<string, unknown> | null> = {
    meet_transcripts: {
      id: 'transcript-a', room_id: 'room-a', status: overrides.transcriptStatus ?? 'active',
      retention_expires_at: overrides.transcriptRetentionExpiresAt ?? '2099-01-01T00:00:00.000Z',
    },
    meet_rooms: {
      id: 'room-a', room_name: 'room-name', status: overrides.roomStatus ?? 'active',
      expires_at: '2099-01-01T00:00:00.000Z',
    },
    meet_room_members: {
      id: 'member-a', room_id: 'room-a', user_id: userId, role: 'participant',
      status: overrides.memberStatus ?? 'approved', display_name: 'Alice',
    },
    meet_transcript_consents: {
      id: 'consent-a', transcript_id: 'transcript-a', room_id: 'room-a', member_id: 'member-a',
      user_id: userId, livekit_participant_identity: identity,
      accepted_at: '2026-08-24T10:00:00.000Z', revoked_at: overrides.consentRevokedAt ?? null,
    },
  }

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => ({ data: rows[table] ?? null, error: null }))
    builder.insert = vi.fn((value: unknown) => {
      inserted.push(value)
      return builder
    })
    builder.single = vi.fn(async () => ({ data: { id: 'segment-a' }, error: null }))
    return builder
  })
  return { supabase: { from } as unknown as SupabaseClient, from, inserted }
}

function finalInput(overrides: Partial<Parameters<typeof persistFinalTranscriptSegment>[1]> = {}) {
  return {
    transcriptId: 'transcript-a',
    livekitParticipantIdentity: identity,
    participantAttributes: attributes,
    sourceTrackSid: 'TR_microphone',
    providerSegmentId: 'provider-segment-a',
    text: '  Texto original final.  ',
    language: 'pt-BR',
    startOffsetMs: 100,
    endOffsetMs: 900,
    final: true,
    ...overrides,
  }
}

describe('Meet transcription server foundation', () => {
  it('uses a concrete 15-day retention timestamp', () => {
    expect(getTranscriptRetentionExpiry(new Date('2026-08-24T00:00:00.000Z')))
      .toBe('2026-09-08T00:00:00.000Z')
    expect(hasMeetTranscriptExpired(
      { retention_expires_at: '2026-09-08T00:00:00.000Z' },
      new Date('2026-09-08T00:00:00.000Z'),
    )).toBe(true)
    expect(hasMeetTranscriptExpired(
      { retention_expires_at: 'invalid' },
      new Date('2026-08-24T00:00:00.000Z'),
    )).toBe(true)
  })

  it('requires matching admin-reviewed adult evidence and fails closed otherwise', () => {
    const now = new Date('2026-08-24T00:00:00.000Z')
    const approved = {
      user_id: userId,
      birth_date: '1990-01-01',
      status: 'approved',
      reviewed_by: 'admin-a',
      reviewed_at: '2026-08-23T00:00:00.000Z',
    }
    expect(evaluateTranscriptionAge(null, approved, now))
      .toMatchObject({ eligible: false, reason: 'unknown' })
    expect(evaluateTranscriptionAge(
      { id: userId, birth_date: '2010-01-01', is_minor: false },
      { ...approved, birth_date: '2010-01-01' },
      now,
    ))
      .toMatchObject({ eligible: false, reason: 'minor' })
    expect(evaluateTranscriptionAge(
      { id: userId, birth_date: '1990-01-01', is_minor: true }, approved, now,
    ))
      .toMatchObject({ eligible: false, reason: 'minor' })
    expect(evaluateTranscriptionAge(
      { id: userId, birth_date: '1990-01-01', is_minor: false }, null, now,
    )).toMatchObject({ eligible: false, reason: 'unverified' })
    expect(evaluateTranscriptionAge(
      { id: userId, birth_date: '1990-01-01', is_minor: false },
      { ...approved, birth_date: '1991-01-01' },
      now,
    )).toMatchObject({ eligible: false, reason: 'unverified' })
    expect(evaluateTranscriptionAge(
      { id: userId, birth_date: '1990-01-01', is_minor: false }, approved, now,
    ))
      .toEqual({ eligible: true })
  })

  it('never persists interim captions', async () => {
    const database = createSegmentDatabase()
    await expect(persistFinalTranscriptSegment(database.supabase, finalInput({ final: false })))
      .resolves.toEqual({ persisted: false, reason: 'interim' })
    expect(database.from).not.toHaveBeenCalled()
  })

  it('fails closed for an unattributed human/SIP participant but ignores an agent process', async () => {
    const service = (participants: Array<{ identity: string; kind: number }>) => ({
      listRooms: vi.fn(),
      createRoom: vi.fn(),
      deleteRoom: vi.fn(),
      listParticipants: vi.fn(async () => participants),
    })
    const room = { id: 'room-a', room_name: 'room-name' } as never
    await expect(listValidatedConnectedParticipants(
      {} as SupabaseClient,
      room,
      service([{ identity: 'sip-a', kind: 3 }]),
    )).rejects.toThrow('MEET_TRANSCRIPTION_PARTICIPANT_IDENTITY_INVALID')
    await expect(listValidatedConnectedParticipants(
      {} as SupabaseClient,
      room,
      service([{ identity: 'agent-a', kind: 4 }]),
    )).resolves.toEqual([])
  })

  it('resolves a strict server identity with matching attributes or with attributes omitted', async () => {
    const database = createParticipantMembershipDatabase([participantMembership()])
    const room = { id: 'room-a', room_name: 'room-name' } as never

    await expect(listValidatedConnectedParticipants(
      database,
      room,
      participantService(connectedParticipant()),
    )).resolves.toMatchObject([{ member: { id: '22222222-2222-4222-8222-222222222222' } }])
    await expect(listValidatedConnectedParticipants(
      database,
      room,
      participantService(connectedParticipant({ attributes: {} })),
    )).resolves.toMatchObject([{ member: { user_id: userId, room_id: 'room-a', status: 'approved' } }])
  })

  it.each([
    [ENTREUS_LIVEKIT_ATTRIBUTES.memberId, '33333333-3333-4333-8333-333333333333'],
    [ENTREUS_LIVEKIT_ATTRIBUTES.roomId, 'room-b'],
    [ENTREUS_LIVEKIT_ATTRIBUTES.userId, '44444444-4444-4444-8444-444444444444'],
    [ENTREUS_LIVEKIT_ATTRIBUTES.role, 'owner'],
  ])('fails closed when a present %s attribute does not match the database', async (key, value) => {
    const database = createParticipantMembershipDatabase([participantMembership()])
    const participant = connectedParticipant()
    participant.attributes = { ...participant.attributes, [key]: value }

    await expect(listValidatedConnectedParticipants(
      database,
      { id: 'room-a', room_name: 'room-name' } as never,
      participantService(participant),
    )).rejects.toThrow('MEET_TRANSCRIPTION_PARTICIPANT_IDENTITY_INVALID')
  })

  it('rejects malformed identities, cross-room users, revoked members and ambiguous membership', async () => {
    const room = { id: 'room-a', room_name: 'room-name' } as never
    await expect(listValidatedConnectedParticipants(
      createParticipantMembershipDatabase([participantMembership()]),
      room,
      participantService(connectedParticipant({ identity: `${userId}-nothex!!`, attributes: {} })),
    )).rejects.toThrow('MEET_TRANSCRIPTION_PARTICIPANT_IDENTITY_INVALID')
    await expect(listValidatedConnectedParticipants(
      createParticipantMembershipDatabase([participantMembership({ room_id: 'room-b' })]),
      room,
      participantService(connectedParticipant({ attributes: {} })),
    )).rejects.toThrow('MEET_TRANSCRIPTION_PARTICIPANT_IDENTITY_INVALID')
    await expect(listValidatedConnectedParticipants(
      createParticipantMembershipDatabase([participantMembership({ status: 'left' })]),
      room,
      participantService(connectedParticipant({ attributes: {} })),
    )).rejects.toThrow('MEET_TRANSCRIPTION_PARTICIPANT_IDENTITY_INVALID')
    await expect(listValidatedConnectedParticipants(
      createParticipantMembershipDatabase([
        participantMembership(),
        participantMembership({ id: '55555555-5555-4555-8555-555555555555' }),
      ]),
      room,
      participantService(connectedParticipant({ attributes: {} })),
    )).rejects.toThrow('MEET_TRANSCRIPTION_PARTICIPANT_MEMBERSHIP_AMBIGUOUS')
  })

  it('persists a final segment with server-derived room/member/user and speaker snapshot', async () => {
    const database = createSegmentDatabase()
    await expect(persistFinalTranscriptSegment(database.supabase, finalInput()))
      .resolves.toEqual({ persisted: true, id: 'segment-a' })
    expect(database.inserted).toHaveLength(1)
    expect(database.inserted[0]).toMatchObject({
      transcript_id: 'transcript-a',
      room_id: 'room-a',
      member_id: 'member-a',
      user_id: userId,
      livekit_participant_identity: identity,
      speaker_display_name: 'Alice',
      original_text: 'Texto original final.',
      language: 'pt-BR',
    })
  })

  it('keeps member consent valid after a server-issued LiveKit reconnection identity changes', async () => {
    const database = createSegmentDatabase()
    await expect(persistFinalTranscriptSegment(
      database.supabase,
      finalInput({ livekitParticipantIdentity: `${userId}-deadbeef` }),
    )).resolves.toMatchObject({ persisted: true })
  })

  it('rejects speaker spoofing, revoked consent and writes after room/session termination', async () => {
    await expect(persistFinalTranscriptSegment(
      createSegmentDatabase().supabase,
      finalInput({ participantAttributes: { ...attributes, [ENTREUS_LIVEKIT_ATTRIBUTES.userId]: 'forged' } }),
    )).rejects.toThrow('MEET_TRANSCRIPT_SPEAKER_NOT_AUTHORIZED')
    await expect(persistFinalTranscriptSegment(
      createSegmentDatabase({ consentRevokedAt: '2026-08-24T10:01:00.000Z' }).supabase,
      finalInput(),
    )).rejects.toThrow('MEET_TRANSCRIPT_CONSENT_REQUIRED')
    await expect(persistFinalTranscriptSegment(
      createSegmentDatabase({ roomStatus: 'ended' }).supabase,
      finalInput(),
    )).rejects.toThrow('MEET_TRANSCRIPT_ROOM_NOT_ACTIVE')
    await expect(persistFinalTranscriptSegment(
      createSegmentDatabase({ transcriptStatus: 'ended' }).supabase,
      finalInput(),
    )).rejects.toThrow('MEET_TRANSCRIPT_NOT_ACTIVE')
    await expect(persistFinalTranscriptSegment(
      createSegmentDatabase({ transcriptRetentionExpiresAt: '2020-01-01T00:00:00.000Z' }).supabase,
      finalInput(),
    )).rejects.toThrow('MEET_TRANSCRIPT_EXPIRED')
  })
})
