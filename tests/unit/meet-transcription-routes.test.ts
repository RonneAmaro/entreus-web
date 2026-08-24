import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  access: null as null | Record<string, unknown>,
  transcript: null as null | Record<string, unknown>,
  consent: null as null | Record<string, unknown>,
  participants: [] as Array<Record<string, unknown>>,
  age: { eligible: true } as { eligible: boolean; reason?: 'minor' | 'unknown' | 'unverified' },
  consentAction: null as null | 'accept' | 'revoke',
  getMeetTranscriptionAccess: vi.fn(),
  getOpenMeetTranscript: vi.fn(),
  hasMeetTranscriptExpired: vi.fn(),
  getTranscriptConsent: vi.fn(),
  listValidatedConnectedParticipants: vi.fn(),
  assertParticipantsAreAdults: vi.fn(),
  reconcileMeetTranscriptionConsentState: vi.fn(),
  recordMeetTranscriptConsent: vi.fn(),
  toPublicMeetTranscript: vi.fn(),
}))

vi.mock('@/lib/meet-server', () => ({
  hasRoomExpired: (room: { expires_at?: string }) => Boolean(
    room.expires_at && Date.parse(room.expires_at) < Date.now(),
  ),
  jsonError: (message: string, status: number) => Response.json({ ok: false, error: message }, { status }),
}))

vi.mock('@/lib/meet/transcription-server', () => ({
  MEET_TRANSCRIPTION_AGE_UNKNOWN_MESSAGE: 'AGE_UNKNOWN',
  MEET_TRANSCRIPTION_AGE_VERIFICATION_REQUIRED_MESSAGE: 'AGE_UNVERIFIED',
  MEET_TRANSCRIPTION_MINOR_BLOCKED_MESSAGE: 'MINOR_BLOCKED',
  getTranscriptRetentionExpiry: () => '2026-09-08T00:00:00.000Z',
  getMeetTranscriptionAccess: state.getMeetTranscriptionAccess,
  getOpenMeetTranscript: state.getOpenMeetTranscript,
  hasMeetTranscriptExpired: state.hasMeetTranscriptExpired,
  getTranscriptConsent: state.getTranscriptConsent,
  listValidatedConnectedParticipants: state.listValidatedConnectedParticipants,
  assertParticipantsAreAdults: state.assertParticipantsAreAdults,
  reconcileMeetTranscriptionConsentState: state.reconcileMeetTranscriptionConsentState,
  recordMeetTranscriptConsent: state.recordMeetTranscriptConsent,
  toPublicMeetTranscript: state.toPublicMeetTranscript,
}))

function transcript(overrides: Record<string, unknown> = {}) {
  return {
    id: 'transcript-a', room_id: 'room-a', status: 'pending_consent',
    retention_expires_at: '2026-09-08T00:00:00.000Z', ended_at: null,
    ...overrides,
  }
}

function consent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'consent-a', transcript_id: 'transcript-a', room_id: 'room-a',
    member_id: 'member-a', user_id: 'user-a',
    livekit_participant_identity: 'user-a-a1b2c3d4',
    accepted_at: null, revoked_at: null, ...overrides,
  }
}

function createDatabase() {
  const operations: Array<{ table: string; action: string; value: unknown }> = []
  const from = vi.fn((table: string) => {
    let updated: Record<string, unknown> = {}
    const builder: Record<string, unknown> & {
      error: null
      count: number
      data: unknown[]
    } = { error: null, count: 1, data: [] }
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
    builder.in = vi.fn(() => {
      if (table === 'meet_transcript_consents') {
        builder.data = [{ member_id: 'member-a', accepted_at: '2026-08-24T10:00:00.000Z', revoked_at: null }]
      }
      return builder
    })
    builder.insert = vi.fn((value: unknown) => {
      operations.push({ table, action: 'insert', value })
      return builder
    })
    builder.update = vi.fn((value: Record<string, unknown>) => {
      updated = value
      operations.push({ table, action: 'update', value })
      return builder
    })
    builder.single = vi.fn(async () => ({
      data: table === 'meet_transcripts'
        ? transcript()
        : consent({ accepted_at: '2026-08-24T10:00:00.000Z' }),
      error: null,
    }))
    builder.maybeSingle = vi.fn(async () => ({
      data: table === 'meet_transcripts'
        ? transcript(updated)
        : consent(updated),
      error: null,
    }))
    return builder
  })
  return { from, operations }
}

function request(path: string, body?: object) {
  return new Request(`http://localhost${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: 'Bearer test', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  const supabase = createDatabase()
  state.access = {
    auth: { user: { id: 'user-a' } },
    supabase,
    room: {
      id: 'room-a', room_name: 'room-name', owner_id: 'user-a', status: 'active',
      expires_at: '2099-01-01T00:00:00.000Z',
    },
    membership: { id: 'member-a', room_id: 'room-a', user_id: 'user-a', role: 'owner', status: 'approved' },
    isModerator: true,
  }
  state.transcript = null
  state.consent = null
  state.participants = [{
    participant: { identity: 'user-a-a1b2c3d4' },
    member: (state.access.membership as object),
  }]
  state.age = { eligible: true }
  state.consentAction = null
  state.getMeetTranscriptionAccess.mockImplementation(async () => state.access)
  state.getOpenMeetTranscript.mockImplementation(async () => state.transcript)
  state.hasMeetTranscriptExpired.mockImplementation(
    (value: { retention_expires_at: string }) => Date.parse(value.retention_expires_at) <= Date.now(),
  )
  state.getTranscriptConsent.mockImplementation(async () => state.consent)
  state.listValidatedConnectedParticipants.mockImplementation(async () => state.participants)
  state.assertParticipantsAreAdults.mockImplementation(async () => state.age)
  state.recordMeetTranscriptConsent.mockImplementation(async (_supabase, input: { action: 'accept' | 'revoke' }) => {
    state.consentAction = input.action
    return consent(input.action === 'accept'
      ? { accepted_at: '2026-08-24T10:00:00.000Z' }
      : { revoked_at: '2026-08-24T10:00:00.000Z' })
  })
  state.reconcileMeetTranscriptionConsentState.mockImplementation(async (_supabase, _room, value) => ({
    ...value,
    ...(state.consentAction === 'accept' ? { status: 'ready' } : {}),
    ...(state.consentAction === 'revoke' ? { status: 'ended', ended_at: '2026-08-24T10:00:00.000Z' } : {}),
  }))
  state.toPublicMeetTranscript.mockImplementation((value: Record<string, unknown>, currentConsent: Record<string, unknown> | null) => ({
    id: value.id,
    status: value.status,
    consent: currentConsent,
    requiresConsent: !currentConsent?.accepted_at && !currentConsent?.revoked_at,
    providerReady: false,
  }))
})

describe('Meet transcription routes', () => {
  it('rejects a revoked or cross-room member before querying transcript data', async () => {
    state.getMeetTranscriptionAccess.mockResolvedValue({ error: Response.json({ ok: false }, { status: 403 }) })
    const { GET } = await import('@/app/api/meet/rooms/[roomName]/transcription/route')
    const response = await GET(request('/api/meet/rooms/other/transcription'), {
      params: Promise.resolve({ roomName: 'other' }),
    })
    expect(response.status).toBe(403)
    expect(state.getOpenMeetTranscript).not.toHaveBeenCalled()
  })

  it('returns allowed non-expired state to an active approved member', async () => {
    state.transcript = transcript()
    state.consent = consent({ accepted_at: '2026-08-24T10:00:00.000Z' })
    const { GET } = await import('@/app/api/meet/rooms/[roomName]/transcription/route')
    const response = await GET(request('/api/meet/rooms/room-name/transcription'), {
      params: Promise.resolve({ roomName: 'room-name' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      transcript: { id: 'transcript-a', consent: { accepted_at: '2026-08-24T10:00:00.000Z' } },
    })
    expect(state.getTranscriptConsent).toHaveBeenCalled()
  })

  it('does not leak an expired transcript or its consent through the service-role GET path', async () => {
    state.transcript = transcript({
      retention_expires_at: '2020-01-01T00:00:00.000Z',
      provider: 'sensitive-provider',
      provider_model: 'sensitive-model',
    })
    state.consent = consent({ accepted_at: '2020-01-01T00:00:00.000Z' })
    const { GET } = await import('@/app/api/meet/rooms/[roomName]/transcription/route')
    const response = await GET(request('/api/meet/rooms/room-name/transcription'), {
      params: Promise.resolve({ roomName: 'room-name' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, transcript: null })
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(state.getTranscriptConsent).not.toHaveBeenCalled()
    expect(state.toPublicMeetTranscript).not.toHaveBeenCalled()
  })

  it('rejects expired consent writes before reading participants or consent records', async () => {
    state.transcript = transcript({ retention_expires_at: '2020-01-01T00:00:00.000Z' })
    const { POST } = await import('@/app/api/meet/rooms/[roomName]/transcription/consent/route')
    const response = await POST(request('/x', { action: 'accept' }), {
      params: Promise.resolve({ roomName: 'room-name' }),
    })

    expect(response.status).toBe(404)
    expect(state.listValidatedConnectedParticipants).not.toHaveBeenCalled()
    expect(state.recordMeetTranscriptConsent).not.toHaveBeenCalled()
    expect(state.toPublicMeetTranscript).not.toHaveBeenCalled()
  })

  it('requires a moderator and an active non-expired room to start', async () => {
    const { POST } = await import('@/app/api/meet/rooms/[roomName]/transcription/route')
    state.access = { ...state.access, isModerator: false }
    expect((await POST(request('/x', {}), { params: Promise.resolve({ roomName: 'room-name' }) })).status).toBe(403)
    state.access = { ...state.access, isModerator: true, room: { ...(state.access?.room as object), status: 'ended' } }
    expect((await POST(request('/x', {}), { params: Promise.resolve({ roomName: 'room-name' }) })).status).toBe(403)
    state.access = {
      ...state.access,
      room: { ...(state.access?.room as object), status: 'active', expires_at: '2020-01-01T00:00:00.000Z' },
    }
    expect((await POST(request('/x', {}), { params: Promise.resolve({ roomName: 'room-name' }) })).status).toBe(403)
    expect(state.listValidatedConnectedParticipants).not.toHaveBeenCalled()
  })

  it('creates only a pending-consent session and snapshots every connected participant', async () => {
    const { POST } = await import('@/app/api/meet/rooms/[roomName]/transcription/route')
    const response = await POST(request('/x', {}), { params: Promise.resolve({ roomName: 'room-name' }) })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      transcript: { status: 'pending_consent', requiresConsent: true, providerReady: false },
    })
    const database = state.access?.supabase as ReturnType<typeof createDatabase>
    expect(database.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'meet_transcripts', action: 'insert', value: expect.objectContaining({ status: 'pending_consent' }) }),
      expect.objectContaining({ table: 'meet_transcript_consents', action: 'insert' }),
    ]))
  })

  it('blocks start when a connected participant is a minor or age is uncertain', async () => {
    const { POST } = await import('@/app/api/meet/rooms/[roomName]/transcription/route')
    state.age = { eligible: false, reason: 'minor' }
    expect((await POST(request('/x', {}), { params: Promise.resolve({ roomName: 'room-name' }) })).status).toBe(403)
    state.age = { eligible: false, reason: 'unknown' }
    expect((await POST(request('/x', {}), { params: Promise.resolve({ roomName: 'room-name' }) })).status).toBe(403)
    state.age = { eligible: false, reason: 'unverified' }
    expect((await POST(request('/x', {}), { params: Promise.resolve({ roomName: 'room-name' }) })).status).toBe(403)
  })

  it('rejects forged consent when the authenticated member is not connected', async () => {
    state.transcript = transcript()
    state.participants = []
    const { POST } = await import('@/app/api/meet/rooms/[roomName]/transcription/consent/route')
    const response = await POST(request('/x', { action: 'accept' }), {
      params: Promise.resolve({ roomName: 'room-name' }),
    })
    expect(response.status).toBe(409)
  })

  it('moves to ready only after connected participants consent and never claims provider readiness', async () => {
    state.transcript = transcript()
    const { POST } = await import('@/app/api/meet/rooms/[roomName]/transcription/consent/route')
    const response = await POST(request('/x', { action: 'accept' }), {
      params: Promise.resolve({ roomName: 'room-name' }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      transcript: { status: 'ready', providerReady: false },
    })
  })

  it('keeps an accepted consent replay idempotent instead of inserting another identity choice', async () => {
    state.transcript = transcript({ status: 'ready' })
    state.consent = consent({ accepted_at: '2026-08-24T10:00:00.000Z' })
    const { POST } = await import('@/app/api/meet/rooms/[roomName]/transcription/consent/route')
    const response = await POST(request('/x', { action: 'accept', memberId: 'forged-member' }), {
      params: Promise.resolve({ roomName: 'room-name' }),
    })
    expect(response.status).toBe(200)
    expect(state.recordMeetTranscriptConsent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'accept' }),
    )
  })

  it('ends the whole session on consent revocation and never silently reaccepts it', async () => {
    state.transcript = transcript({ status: 'active' })
    state.consent = consent({ accepted_at: '2026-08-24T10:00:00.000Z' })
    const { POST } = await import('@/app/api/meet/rooms/[roomName]/transcription/consent/route')
    const response = await POST(request('/x', { action: 'revoke' }), {
      params: Promise.resolve({ roomName: 'room-name' }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ transcript: { status: 'ended' } })
    expect(state.recordMeetTranscriptConsent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'revoke' }),
    )
    expect(state.reconcileMeetTranscriptionConsentState).toHaveBeenCalled()
  })
})
