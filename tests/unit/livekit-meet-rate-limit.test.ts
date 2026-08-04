import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 'user-a',
  requireUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getRoomByName: vi.fn(),
  expireRoomIfNeeded: vi.fn(),
  getMembership: vi.fn(),
  canJoinRoom: vi.fn(),
  isActiveVipUser: vi.fn(),
  getMeetPlanForCreator: vi.fn(),
  getProfileDisplayName: vi.fn(),
  accessToken: vi.fn(),
  toJwt: vi.fn(),
  supabase: {} as Record<string, unknown>,
}))

vi.mock('@/lib/meet-server', () => ({
  requireUser: state.requireUser,
  getSupabaseAdmin: state.getSupabaseAdmin,
  getRoomByName: state.getRoomByName,
  expireRoomIfNeeded: state.expireRoomIfNeeded,
  getMembership: state.getMembership,
  canJoinRoom: state.canJoinRoom,
  isActiveVipUser: state.isActiveVipUser,
  getMeetPlanForCreator: state.getMeetPlanForCreator,
  getProfileDisplayName: state.getProfileDisplayName,
  hasRoomExpired: () => false,
  jsonError: (message: string, status: number) => Response.json({ ok: false, error: message }, { status }),
}))

vi.mock('livekit-server-sdk', () => ({
  AccessToken: class {
    addGrant = vi.fn()
    toJwt = state.toJwt
    constructor(...args: unknown[]) {
      state.accessToken(...args)
    }
  },
}))

function request(url: string, ip: string, body?: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'x-forwarded-for': ip,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body ?? { roomName: 'room-a', participantName: 'Alice' }),
  })
}

function getRequest(url: string, ip: string) {
  return new Request(url, {
    method: 'GET',
    headers: { authorization: 'Bearer test-token', 'x-forwarded-for': ip },
  })
}

function room(name = 'room-a') {
  return {
    id: `id-${name}`,
    room_name: name,
    status: 'active',
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
}

function createSupabase() {
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'created-room' }, error: null })) })),
  }))
  const from = vi.fn(() => ({
    insert,
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error: null })) })),
      })),
    })),
  }))
  return { from, insert }
}

async function loadTokenRoute() {
  return await import('@/app/api/livekit/token/route')
}

async function loadRoomsRoute() {
  return await import('@/app/api/meet/rooms/route')
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.userId = 'user-a'
  state.supabase = createSupabase()
  state.requireUser.mockResolvedValue({ user: { id: state.userId, email: 'a@example.com' } })
  state.getSupabaseAdmin.mockReturnValue(state.supabase)
  state.getRoomByName.mockResolvedValue(room())
  state.expireRoomIfNeeded.mockImplementation(async (_supabase: unknown, value: unknown) => value)
  state.getMembership.mockResolvedValue({ id: 'member-a', status: 'approved', display_name: 'Alice' })
  state.canJoinRoom.mockReturnValue(true)
  state.toJwt.mockResolvedValue('jwt-token')
  state.accessToken.mockReset()
  state.isActiveVipUser.mockResolvedValue(false)
  state.getMeetPlanForCreator.mockReturnValue({ plan: 'free', durationMinutes: 20 })
  state.getProfileDisplayName.mockResolvedValue('Alice')
  process.env.LIVEKIT_URL = 'wss://livekit.example.com'
  process.env.LIVEKIT_API_KEY = 'key'
  process.env.LIVEKIT_API_SECRET = 'secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.com'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
})

describe('LiveKit token rate limits', () => {
  it('allows an authorized request to create a token', async () => {
    const route = await loadTokenRoute()
    const response = await route.POST!(request('http://localhost/api/livekit/token', '198.51.100.1'))
    expect(response.status).toBe(200)
    expect(state.accessToken).toHaveBeenCalledTimes(1)
  })

  it('blocks the 31st request by IP before authentication', async () => {
    const route = await loadTokenRoute()
    for (let index = 0; index < 31; index += 1) {
      state.userId = `user-ip-${index}`
      state.requireUser.mockResolvedValue({ user: { id: state.userId } })
      const response = await route.POST!(request('http://localhost/api/livekit/token', '198.51.100.2', { roomName: `room-${index}` }))
      if (index < 30) expect(response.status).toBe(200)
      else expect(response.status).toBe(429)
    }
    const totals = {
      requireUser: state.requireUser.mock.calls.length,
      getSupabaseAdmin: state.getSupabaseAdmin.mock.calls.length,
      getRoomByName: state.getRoomByName.mock.calls.length,
      expireRoomIfNeeded: state.expireRoomIfNeeded.mock.calls.length,
      getMembership: state.getMembership.mock.calls.length,
      accessToken: state.accessToken.mock.calls.length,
      toJwt: state.toJwt.mock.calls.length,
    }
    const blocked = await route.POST!(request('http://localhost/api/livekit/token', '198.51.100.2', { roomName: 'room-after-block' }))
    expect(blocked.status).toBe(429)
    expect(state.requireUser.mock.calls.length).toBe(totals.requireUser)
    expect(state.getSupabaseAdmin.mock.calls.length).toBe(totals.getSupabaseAdmin)
    expect(state.getRoomByName.mock.calls.length).toBe(totals.getRoomByName)
    expect(state.expireRoomIfNeeded.mock.calls.length).toBe(totals.expireRoomIfNeeded)
    expect(state.getMembership.mock.calls.length).toBe(totals.getMembership)
    expect(state.accessToken.mock.calls.length).toBe(totals.accessToken)
    expect(state.toJwt.mock.calls.length).toBe(totals.toJwt)
    expect(state.requireUser).toHaveBeenCalledTimes(30)
    expect(state.accessToken).toHaveBeenCalledTimes(30)
  })

  it('blocks the 21st request for the same user and room before room access', async () => {
    const route = await loadTokenRoute()
    for (let index = 0; index < 21; index += 1) {
      const response = await route.POST!(request('http://localhost/api/livekit/token', '198.51.100.3'))
      expect(response.status).toBe(index < 20 ? 200 : 429)
    }
    expect(state.getRoomByName).toHaveBeenCalledTimes(20)
    expect(state.accessToken).toHaveBeenCalledTimes(20)
  })

  it('keeps user and room quotas independent', async () => {
    const route = await loadTokenRoute()
    state.requireUser.mockResolvedValue({ user: { id: 'user-a' } })
    for (let index = 0; index < 20; index += 1) {
      const response = await route.POST!(request('http://localhost/api/livekit/token', `198.51.100.${20 + index}`, { roomName: 'room-a' }))
      expect(response.status).toBe(200)
    }
    const blocked = await route.POST!(request('http://localhost/api/livekit/token', '198.51.100.50', { roomName: 'room-a' }))
    expect(blocked.status).toBe(429)
    const differentRoom = await route.POST!(request('http://localhost/api/livekit/token', '198.51.100.51', { roomName: 'room-b' }))
    expect(differentRoom.status).toBe(200)
    state.requireUser.mockResolvedValue({ user: { id: 'user-b' } })
    const differentUser = await route.POST!(request('http://localhost/api/livekit/token', '198.51.100.52', { roomName: 'room-a' }))
    expect(differentUser.status).toBe(200)
  })

  it('returns standard headers when token access is rate limited', async () => {
    const route = await loadTokenRoute()
    for (let index = 0; index < 30; index += 1) {
      state.userId = `user-header-${index}`
      state.requireUser.mockResolvedValue({ user: { id: state.userId } })
      await route.POST!(request('http://localhost/api/livekit/token', '198.51.100.6', { roomName: `room-${index}` }))
    }
    const response = await route.POST!(request('http://localhost/api/livekit/token', '198.51.100.6', { roomName: 'room-final' }))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeTruthy()
    expect(response.headers.get('X-RateLimit-Limit')).toBe('30')
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy()
  })
})

describe('Meet room creation rate limits', () => {
  it('keeps room creation and GET functional', async () => {
    const route = await loadRoomsRoute()
    const created = await route.POST!(request('http://localhost/api/meet/rooms', '203.0.113.1', { title: 'Room' }))
    expect(created.status).toBe(200)
    const listed = await route.GET!(getRequest('http://localhost/api/meet/rooms', '203.0.113.2'))
    expect(listed.status).toBe(200)
    await expect(listed.json()).resolves.toMatchObject({ ok: true, rooms: [] })
  })

  it('blocks the 21st IP request before requireUser', async () => {
    const route = await loadRoomsRoute()
    for (let index = 0; index < 21; index += 1) {
      state.userId = `user-ip-${index}`
      state.requireUser.mockResolvedValue({ user: { id: state.userId } })
      const response = await route.POST!(request('http://localhost/api/meet/rooms', '203.0.113.2'))
      expect(response.status).toBe(index < 20 ? 200 : 429)
    }
    expect(state.requireUser).toHaveBeenCalledTimes(20)
  })

  it('blocks the 6th creation for the same user before Supabase access', async () => {
    const route = await loadRoomsRoute()
    for (let index = 0; index < 6; index += 1) {
      const response = await route.POST!(request('http://localhost/api/meet/rooms', `203.0.113.${10 + index}`))
      expect(response.status).toBe(index < 5 ? 200 : 429)
    }
    expect(state.getSupabaseAdmin).toHaveBeenCalledTimes(5)
    expect(state.supabase.from).toHaveBeenCalledTimes(10)
  })

  it('blocks the 6th creation with complete standard headers', async () => {
    const route = await loadRoomsRoute()
    for (let index = 0; index < 5; index += 1) await route.POST!(request('http://localhost/api/meet/rooms', `203.0.113.${30 + index}`))
    const blocked = await route.POST!(request('http://localhost/api/meet/rooms', '203.0.113.35'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBeTruthy()
    expect(blocked.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(blocked.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(blocked.headers.get('X-RateLimit-Reset')).toBeTruthy()
  })

  it('keeps user quotas independent', async () => {
    const route = await loadRoomsRoute()
    for (let index = 0; index < 5; index += 1) await route.POST!(request('http://localhost/api/meet/rooms', `203.0.113.${40 + index}`))
    const blocked = await route.POST!(request('http://localhost/api/meet/rooms', '203.0.113.45'))
    expect(blocked.status).toBe(429)
    state.userId = 'user-b'
    state.requireUser.mockResolvedValue({ user: { id: 'user-b' } })
    const independent = await route.POST!(request('http://localhost/api/meet/rooms', '203.0.113.46'))
    expect(independent.status).toBe(200)
  })

  it('keeps both 429 bodies free of secrets and internal limiter details', async () => {
    const tokenRoute = await loadTokenRoute()
    for (let index = 0; index < 30; index += 1) {
      state.userId = `user-safe-${index}`
      state.requireUser.mockResolvedValue({ user: { id: state.userId } })
      await tokenRoute.POST!(request('http://localhost/api/livekit/token', '198.51.100.100', { roomName: `safe-room-${index}` }))
    }
    const tokenBlocked = await tokenRoute.POST!(request('http://localhost/api/livekit/token', '198.51.100.100', { roomName: 'safe-room-final' }))
    const roomsRoute = await loadRoomsRoute()
    for (let index = 0; index < 5; index += 1) await roomsRoute.POST!(request('http://localhost/api/meet/rooms', `203.0.113.${100 + index}`))
    const roomBlocked = await roomsRoute.POST!(request('http://localhost/api/meet/rooms', '203.0.113.125'))
    expect(tokenBlocked.status).toBe(429)
    expect(roomBlocked.status).toBe(429)
    for (const response of [tokenBlocked, roomBlocked]) {
      const serialized = JSON.stringify(await response.json())
      expect(serialized).toContain('RATE_LIMITED')
      expect(serialized).not.toContain('test-token')
      expect(serialized).not.toContain('key')
      expect(serialized).not.toContain('secret')
      expect(serialized).not.toContain('service-key')
      expect(serialized).not.toContain('LIVEKIT_API_KEY')
      expect(serialized).not.toContain('LIVEKIT_API_SECRET')
      expect(serialized).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
      expect(serialized).not.toContain('livekit-token')
      expect(serialized).not.toContain('meet-room-create')
    }
  })
})
