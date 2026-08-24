import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { ENTREUS_LIVEKIT_ATTRIBUTES } from '@/lib/meet/participant-identity'
import {
  authorizeMeetTranscriptionTrack,
  reconcileMeetTranscriptionConsentState,
  recordMeetTranscriptConsent,
  type MeetTranscript,
} from '@/lib/meet/transcription-server'

const now = new Date('2026-08-24T12:00:00.000Z')

function member(id: string, userId: string) {
  return {
    id,
    room_id: 'room-a',
    user_id: userId,
    role: 'participant',
    status: 'approved',
    display_name: userId,
  }
}

function participant(memberId: string, userId: string, suffix: string) {
  return {
    identity: `${userId}-${suffix}`,
    kind: 0,
    attributes: {
      [ENTREUS_LIVEKIT_ATTRIBUTES.userId]: userId,
      [ENTREUS_LIVEKIT_ATTRIBUTES.memberId]: memberId,
      [ENTREUS_LIVEKIT_ATTRIBUTES.roomId]: 'room-a',
      [ENTREUS_LIVEKIT_ATTRIBUTES.role]: 'participant',
    },
    tracks: [{ sid: `TR-${memberId}`, type: 0, source: 2, muted: false }],
  }
}

type Row = Record<string, unknown>

function createStatefulDatabase() {
  const tables: Record<string, Row[]> = {
    meet_rooms: [{
      id: 'room-a', room_name: 'room-name', owner_id: 'user-a', status: 'active',
      expires_at: '2099-01-01T00:00:00.000Z',
    }],
    meet_room_members: [member('member-a', 'user-a'), member('member-b', 'user-b')],
    profiles: [
      { id: 'user-a', birth_date: '1990-01-01', is_minor: false },
      { id: 'user-b', birth_date: '1991-01-01', is_minor: false },
    ],
    age_verification_requests: [
      {
        id: 'age-a', user_id: 'user-a', birth_date: '1990-01-01', status: 'approved',
        reviewed_by: 'admin-a', reviewed_at: '2026-08-20T00:00:00.000Z',
      },
      {
        id: 'age-b', user_id: 'user-b', birth_date: '1991-01-01', status: 'approved',
        reviewed_by: 'admin-a', reviewed_at: '2026-08-20T00:00:00.000Z',
      },
    ],
    meet_transcripts: [{
      id: 'transcript-a', room_id: 'room-a', status: 'ready', started_at: null, ended_at: null,
      created_by: 'user-a', retention_expires_at: '2099-01-01T00:00:00.000Z',
      language: null, provider: null, provider_model: null,
      created_at: '2026-08-24T10:00:00.000Z', updated_at: '2026-08-24T10:00:00.000Z',
    }],
    meet_transcript_consents: [{
      id: 'consent-a', transcript_id: 'transcript-a', room_id: 'room-a',
      member_id: 'member-a', user_id: 'user-a', livekit_participant_identity: 'user-a-a1b2c3d4',
      accepted_at: '2026-08-24T10:05:00.000Z', revoked_at: null,
    }],
  }

  const from = vi.fn((table: string) => {
    let mode: 'select' | 'update' | 'upsert' = 'select'
    let values: Row | Row[] | null = null
    const filters: Array<(row: Row) => boolean> = []

    const execute = async () => {
      if (mode === 'upsert') {
        for (const value of Array.isArray(values) ? values : [values]) {
          if (!value) continue
          const existing = table === 'meet_transcript_consents'
            ? tables[table].find((row) => (
                row.transcript_id === value.transcript_id && row.member_id === value.member_id
              ))
            : undefined
          if (!existing) tables[table].push({
            id: `${table}-${tables[table].length + 1}`,
            ...(table === 'meet_transcript_consents' ? { accepted_at: null, revoked_at: null } : {}),
            ...value,
          })
        }
        return { data: null, error: null }
      }

      const matching = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
      if (mode === 'update' && values && !Array.isArray(values)) {
        matching.forEach((row) => Object.assign(row, values))
      }
      return { data: matching.map((row) => ({ ...row })), error: null }
    }

    const builder: Record<string, unknown> & PromiseLike<{ data: Row[] | null; error: null }> = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value)
        return builder
      }),
      is: vi.fn((column: string, value: unknown) => {
        filters.push((row) => row[column] === value)
        return builder
      }),
      in: vi.fn((column: string, value: unknown[]) => {
        filters.push((row) => value.includes(row[column]))
        return builder
      }),
      order: vi.fn(() => builder),
      update: vi.fn((next: Row) => {
        mode = 'update'
        values = next
        return builder
      }),
      upsert: vi.fn((next: Row | Row[]) => {
        mode = 'upsert'
        values = next
        return builder
      }),
      maybeSingle: vi.fn(async () => {
        const result = await execute()
        return { data: result.data?.[0] ?? null, error: null }
      }),
      single: vi.fn(async () => {
        const result = await execute()
        return { data: result.data?.[0] ?? null, error: null }
      }),
      then: (resolve, reject) => execute().then(resolve, reject),
    }
    return builder
  })

  return { tables, supabase: { from } as unknown as SupabaseClient }
}

function service(participants: ReturnType<typeof participant>[]) {
  return {
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    deleteRoom: vi.fn(),
    listParticipants: vi.fn(async () => participants),
  }
}

describe('Meet transcription consent reconciliation', () => {
  it('moves ready back to pending when a late participant has not consented', async () => {
    const database = createStatefulDatabase()
    const participants = [
      participant('member-a', 'user-a', 'a1b2c3d4'),
      participant('member-b', 'user-b', 'deadbeef'),
    ]
    const transcript = database.tables.meet_transcripts[0] as MeetTranscript
    const reconciled = await reconcileMeetTranscriptionConsentState(
      database.supabase,
      database.tables.meet_rooms[0] as never,
      transcript,
      { service: service(participants), now },
    )
    expect(reconciled.status).toBe('pending_consent')
    expect(database.tables.meet_transcript_consents).toContainEqual(expect.objectContaining({
      member_id: 'member-b', accepted_at: null, revoked_at: null,
    }))
  })

  it('pauses a future active session when a late participant is observed', async () => {
    const database = createStatefulDatabase()
    database.tables.meet_transcripts[0].status = 'active'
    database.tables.meet_transcripts[0].started_at = '2026-08-24T10:06:00.000Z'
    const reconciled = await reconcileMeetTranscriptionConsentState(
      database.supabase,
      database.tables.meet_rooms[0] as never,
      database.tables.meet_transcripts[0] as MeetTranscript,
      {
        service: service([
          participant('member-a', 'user-a', 'a1b2c3d4'),
          participant('member-b', 'user-b', 'deadbeef'),
        ]),
        now,
      },
    )
    expect(reconciled.status).toBe('paused')
  })

  it('rejects an unconsented late microphone and authorizes it only after explicit consent', async () => {
    const database = createStatefulDatabase()
    const lateParticipant = participant('member-b', 'user-b', 'deadbeef')
    const roomService = service([
      participant('member-a', 'user-a', 'a1b2c3d4'),
      lateParticipant,
    ])
    const input = {
      transcriptId: 'transcript-a',
      livekitParticipantIdentity: lateParticipant.identity,
      participantAttributes: lateParticipant.attributes,
      sourceTrackSid: 'TR-member-b',
      service: roomService,
      now,
    }
    await expect(authorizeMeetTranscriptionTrack(database.supabase, input))
      .resolves.toEqual({ authorized: false, reason: 'consent_gate_closed' })

    await recordMeetTranscriptConsent(database.supabase, {
      transcript: database.tables.meet_transcripts[0] as MeetTranscript,
      room: database.tables.meet_rooms[0] as never,
      member: database.tables.meet_room_members[1] as never,
      participantIdentity: lateParticipant.identity,
      action: 'accept',
      now,
    })

    await expect(authorizeMeetTranscriptionTrack(database.supabase, input))
      .resolves.toMatchObject({
        authorized: true,
        memberId: 'member-b',
        userId: 'user-b',
        sourceTrackSid: 'TR-member-b',
      })
    await expect(authorizeMeetTranscriptionTrack(database.supabase, {
      ...input,
      participantAttributes: {
        ...input.participantAttributes,
        [ENTREUS_LIVEKIT_ATTRIBUTES.userId]: 'forged-user',
      },
    })).resolves.toEqual({ authorized: false, reason: 'participant_unavailable' })
    await expect(authorizeMeetTranscriptionTrack(database.supabase, {
      ...input,
      sourceTrackSid: 'TR-forged',
    })).resolves.toEqual({ authorized: false, reason: 'microphone_track_unavailable' })
  })

  it('rejects revoked consent and ended or expired rooms', async () => {
    const database = createStatefulDatabase()
    const current = participant('member-a', 'user-a', 'a1b2c3d4')
    const input = {
      transcriptId: 'transcript-a',
      livekitParticipantIdentity: current.identity,
      participantAttributes: current.attributes,
      sourceTrackSid: 'TR-member-a',
      service: service([current]),
      now,
    }

    database.tables.meet_transcript_consents[0].revoked_at = '2026-08-24T11:00:00.000Z'
    await expect(authorizeMeetTranscriptionTrack(database.supabase, input))
      .resolves.toMatchObject({ authorized: false })

    database.tables.meet_transcript_consents[0].revoked_at = null
    database.tables.meet_transcripts[0].status = 'ready'
    database.tables.meet_rooms[0].status = 'ended'
    await expect(authorizeMeetTranscriptionTrack(database.supabase, input))
      .resolves.toEqual({ authorized: false, reason: 'room_unavailable' })

    database.tables.meet_rooms[0].status = 'active'
    database.tables.meet_rooms[0].expires_at = '2020-01-01T00:00:00.000Z'
    await expect(authorizeMeetTranscriptionTrack(database.supabase, input))
      .resolves.toEqual({ authorized: false, reason: 'room_unavailable' })

    database.tables.meet_rooms[0].expires_at = '2099-01-01T00:00:00.000Z'
    database.tables.meet_transcripts[0].retention_expires_at = '2020-01-01T00:00:00.000Z'
    await expect(authorizeMeetTranscriptionTrack(database.supabase, input))
      .resolves.toEqual({ authorized: false, reason: 'transcript_unavailable' })
  })

  it('keeps simultaneous first acceptance idempotent', async () => {
    const database = createStatefulDatabase()
    database.tables.meet_transcript_consents = []
    const transcript = database.tables.meet_transcripts[0] as MeetTranscript
    const input = {
      transcript,
      room: database.tables.meet_rooms[0] as never,
      member: database.tables.meet_room_members[0] as never,
      participantIdentity: 'user-a-a1b2c3d4',
      action: 'accept' as const,
      now,
    }
    const [first, second] = await Promise.all([
      recordMeetTranscriptConsent(database.supabase, input),
      recordMeetTranscriptConsent(database.supabase, input),
    ])
    expect(first.accepted_at).toBeTruthy()
    expect(second.accepted_at).toBe(first.accepted_at)
    expect(database.tables.meet_transcript_consents).toHaveLength(1)
  })
})
