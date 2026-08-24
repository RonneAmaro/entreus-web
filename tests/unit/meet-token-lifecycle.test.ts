import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  roomStatus: 'active' as 'active' | 'ended' | 'expired',
  requireUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getRoomByName: vi.fn(),
  expireRoomIfNeeded: vi.fn(),
  getMembership: vi.fn(),
  canJoinRoom: vi.fn(),
  ensureLiveKitMeetRoom: vi.fn(),
  deleteLiveKitMeetRoom: vi.fn(),
  reconcileMeetRoomLifecycle: vi.fn(),
  markMeetRoomLiveKitCreated: vi.fn(),
  accessToken: vi.fn(),
  toJwt: vi.fn(),
}))

vi.mock('@/lib/meet-server', () => ({
  requireUser: state.requireUser,
  getSupabaseAdmin: state.getSupabaseAdmin,
  getRoomByName: state.getRoomByName,
  expireRoomIfNeeded: state.expireRoomIfNeeded,
  getMembership: state.getMembership,
  canJoinRoom: state.canJoinRoom,
  hasRoomExpired: (room: { status: string }) => room.status === 'expired',
  jsonError: (message: string, status: number) => Response.json({ ok: false, error: message }, { status }),
}))

vi.mock('@/lib/meet/livekit-room-server', () => ({
  ensureLiveKitMeetRoom: state.ensureLiveKitMeetRoom,
  deleteLiveKitMeetRoom: state.deleteLiveKitMeetRoom,
}))

vi.mock('@/lib/meet/room-lifecycle-reconciliation-server', () => ({
  reconcileMeetRoomLifecycle: state.reconcileMeetRoomLifecycle,
  markMeetRoomLiveKitCreated: state.markMeetRoomLiveKitCreated,
}))

vi.mock('livekit-server-sdk', () => ({
  AccessToken: class {
    addGrant = vi.fn()
    toJwt = state.toJwt
    constructor(...args: unknown[]) { state.accessToken(...args) }
  },
}))

function tokenRequest(ip: string) {
  return new Request('http://localhost/api/livekit/token', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ roomName: 'room-a', participantName: 'Alice' }),
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.roomStatus = 'active'
  state.requireUser.mockResolvedValue({ user: { id: 'user-a' } })
  state.getSupabaseAdmin.mockReturnValue({})
  state.getRoomByName.mockImplementation(async () => ({
    id: 'room-id', room_name: 'room-a', status: state.roomStatus,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }))
  state.expireRoomIfNeeded.mockImplementation(async (_db: unknown, room: unknown) => room)
  state.getMembership.mockResolvedValue({ status: 'approved', display_name: 'Alice' })
  state.canJoinRoom.mockReturnValue(true)
  state.ensureLiveKitMeetRoom.mockResolvedValue({ room: { name: 'room-a' }, created: true })
  state.deleteLiveKitMeetRoom.mockResolvedValue({ deleted: true })
  state.reconcileMeetRoomLifecycle.mockImplementation(async (_supabase: unknown, value: unknown) => ({
    room: value,
    checkedLiveKit: false,
    liveKitRoom: null,
    cleanupError: null,
  }))
  state.markMeetRoomLiveKitCreated.mockImplementation(async (_supabase: unknown, value: object) => ({
    ...value,
    livekit_created_at: '2026-08-24T12:00:00.000Z',
  }))
  state.toJwt.mockResolvedValue('jwt')
  process.env.LIVEKIT_URL = 'wss://livekit.example.com'
  process.env.LIVEKIT_API_KEY = 'key'
  process.env.LIVEKIT_API_SECRET = 'secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.com'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

describe('LiveKit token lifecycle gate', () => {
  it('does not issue a token for an ended room', async () => {
    state.roomStatus = 'ended'
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.201'))).status).toBe(403)
    expect(state.ensureLiveKitMeetRoom).not.toHaveBeenCalled()
    expect(state.accessToken).not.toHaveBeenCalled()
  })

  it('does not issue a token for an expired room', async () => {
    state.roomStatus = 'expired'
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.202'))).status).toBe(403)
    expect(state.ensureLiveKitMeetRoom).not.toHaveBeenCalled()
  })

  it('ensures the active room before issuing its token', async () => {
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.203'))).status).toBe(200)
    expect(state.ensureLiveKitMeetRoom).toHaveBeenCalledWith('room-a')
    expect(state.ensureLiveKitMeetRoom.mock.invocationCallOrder[0]).toBeLessThan(state.accessToken.mock.invocationCallOrder[0])
    expect(state.markMeetRoomLiveKitCreated.mock.invocationCallOrder[0]).toBeLessThan(state.accessToken.mock.invocationCallOrder[0])
  })

  it('does not generate a JWT when LiveKit room creation fails', async () => {
    state.ensureLiveKitMeetRoom.mockRejectedValue(new Error('unavailable'))
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.204'))).status).toBe(500)
    expect(state.accessToken).not.toHaveBeenCalled()
    expect(state.toJwt).not.toHaveBeenCalled()
  })

  it('closes the ensured room and withholds the JWT if the room ends concurrently', async () => {
    state.ensureLiveKitMeetRoom.mockImplementation(async () => {
      state.roomStatus = 'ended'
      return { room: { name: 'room-a' }, created: true }
    })
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.205'))).status).toBe(403)
    expect(state.deleteLiveKitMeetRoom).toHaveBeenCalledWith('room-a')
    expect(state.accessToken).not.toHaveBeenCalled()
  })

  it('does not ensure or issue a token when reconciliation ends the room', async () => {
    state.reconcileMeetRoomLifecycle.mockImplementation(async (_supabase: unknown, value: object) => ({
      room: { ...value, status: 'ended', ended_at: '2026-08-24T12:00:00.000Z' },
      checkedLiveKit: true,
      liveKitRoom: null,
      cleanupError: null,
    }))
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.206'))).status).toBe(403)
    expect(state.ensureLiveKitMeetRoom).not.toHaveBeenCalled()
    expect(state.accessToken).not.toHaveBeenCalled()
  })

  it('fails closed and cleans up a newly created room when marker persistence fails', async () => {
    state.markMeetRoomLiveKitCreated.mockRejectedValue(new Error('marker failed'))
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.207'))).status).toBe(500)
    expect(state.deleteLiveKitMeetRoom).toHaveBeenCalledWith('room-a')
    expect(state.accessToken).not.toHaveBeenCalled()
  })

  it('does not delete an existing room when marker persistence fails', async () => {
    state.ensureLiveKitMeetRoom.mockResolvedValue({ room: { name: 'room-a' }, created: false })
    state.markMeetRoomLiveKitCreated.mockRejectedValue(new Error('marker failed'))
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.208'))).status).toBe(500)
    expect(state.deleteLiveKitMeetRoom).not.toHaveBeenCalled()
  })

  it('withholds the token when the database room ends between ensure and marker update', async () => {
    state.markMeetRoomLiveKitCreated.mockImplementation(async (_supabase: unknown, value: object) => ({
      ...value,
      status: 'ended',
      ended_at: '2026-08-24T12:00:00.000Z',
      livekit_created_at: null,
    }))
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.210'))).status).toBe(403)
    expect(state.deleteLiveKitMeetRoom).toHaveBeenCalledWith('room-a')
    expect(state.accessToken).not.toHaveBeenCalled()
  })

  it.each([['emptyTimeout', '198.51.100.211'], ['departureTimeout', '198.51.100.212']])(
    'does not recreate a room after reconciliation proves %s finished it',
    async (_timeout, ip) => {
      state.reconcileMeetRoomLifecycle.mockImplementation(async (_supabase: unknown, value: object) => ({
        room: { ...value, status: 'ended', ended_at: '2026-08-24T12:00:00.000Z' },
        checkedLiveKit: true,
        liveKitRoom: null,
        cleanupError: null,
      }))
      const { POST } = await import('@/app/api/livekit/token/route')
      expect((await POST(tokenRequest(ip))).status).toBe(403)
      expect(state.ensureLiveKitMeetRoom).not.toHaveBeenCalled()
      expect(state.accessToken).not.toHaveBeenCalled()
    },
  )

  it('reuses a reconciled existing LiveKit room without a second ensure lookup', async () => {
    state.reconcileMeetRoomLifecycle.mockImplementation(async (_supabase: unknown, value: unknown) => ({
      room: value,
      checkedLiveKit: true,
      liveKitRoom: { name: 'room-a', numParticipants: 0 },
      cleanupError: null,
    }))
    const { POST } = await import('@/app/api/livekit/token/route')
    expect((await POST(tokenRequest('198.51.100.209'))).status).toBe(200)
    expect(state.ensureLiveKitMeetRoom).not.toHaveBeenCalled()
    expect(state.markMeetRoomLiveKitCreated).toHaveBeenCalledTimes(1)
  })
})
