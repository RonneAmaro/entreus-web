import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  room: null as null | Record<string, unknown>,
  requireUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getRoomByName: vi.fn(),
  expireRoomIfNeeded: vi.fn(),
  getMembership: vi.fn(),
  reconcileMeetRoomLifecycle: vi.fn(),
}))

vi.mock('@/lib/meet-server', () => ({
  canJoinRoom: (membership: { status?: string } | null) => membership?.status === 'approved',
  requireUser: state.requireUser,
  getSupabaseAdmin: state.getSupabaseAdmin,
  getRoomByName: state.getRoomByName,
  expireRoomIfNeeded: state.expireRoomIfNeeded,
  getMembership: state.getMembership,
  publicRoom: (room: Record<string, unknown>) => room,
  publicMembership: (membership: unknown) => membership,
  jsonError: (message: string, status: number) => Response.json({ ok: false, error: message }, { status }),
}))

vi.mock('@/lib/meet/room-lifecycle-reconciliation-server', () => ({
  reconcileMeetRoomLifecycle: state.reconcileMeetRoomLifecycle,
}))

vi.mock('@/lib/logging/safe-logger', () => ({ logServerEvent: vi.fn() }))

function room(livekitCreatedAt: string | null = '2026-08-24T10:01:00.000Z') {
  return {
    id: 'room-id',
    room_name: 'room-a',
    owner_id: 'owner-a',
    status: 'active',
    ended_at: null,
    livekit_created_at: livekitCreatedAt,
  }
}

async function getRoom(query = '') {
  const { GET } = await import('@/app/api/meet/rooms/[roomName]/route')
  return GET(
    new Request(`http://localhost/api/meet/rooms/room-a${query}`, { headers: { authorization: 'Bearer test' } }),
    { params: Promise.resolve({ roomName: 'room-a' }) },
  )
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.room = room()
  state.requireUser.mockResolvedValue({ user: { id: 'owner-a' } })
  state.getSupabaseAdmin.mockReturnValue({})
  state.getRoomByName.mockImplementation(async () => state.room)
  state.expireRoomIfNeeded.mockImplementation(async (_db: unknown, value: unknown) => value)
  state.getMembership.mockResolvedValue({ id: 'member-a', status: 'approved' })
  state.reconcileMeetRoomLifecycle.mockImplementation(async (_db: unknown, value: unknown) => ({
    room: value,
    checkedLiveKit: true,
    liveKitRoom: { name: 'room-a' },
    cleanupError: null,
  }))
})

describe('Meet room status reconciliation route', () => {
  it('does not perform a LiveKit lookup on ordinary frequent status loads', async () => {
    expect((await getRoom()).status).toBe(200)
    expect(state.reconcileMeetRoomLifecycle).not.toHaveBeenCalled()
  })

  it('does not reconcile a never-started room even when explicitly requested', async () => {
    state.room = room(null)
    expect((await getRoom('?reconcile=1')).status).toBe(200)
    expect(state.reconcileMeetRoomLifecycle).not.toHaveBeenCalled()
  })

  it('does not let an unapproved user trigger a LiveKit lifecycle lookup', async () => {
    state.getMembership.mockResolvedValue({ id: 'member-a', status: 'pending' })
    expect((await getRoom('?reconcile=1')).status).toBe(200)
    expect(state.reconcileMeetRoomLifecycle).not.toHaveBeenCalled()
  })

  it('reconciles a marked room only when the client requests the slower lifecycle check', async () => {
    state.reconcileMeetRoomLifecycle.mockImplementation(async (_db: unknown, value: object) => ({
      room: { ...value, status: 'ended', ended_at: '2026-08-24T10:05:00.000Z' },
      checkedLiveKit: true,
      liveKitRoom: null,
      cleanupError: null,
    }))
    const response = await getRoom('?reconcile=1')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ room: { status: 'ended' } })
    expect(state.reconcileMeetRoomLifecycle).toHaveBeenCalledTimes(1)
  })

  it('keeps the last safe database state when the LiveKit lookup fails', async () => {
    state.reconcileMeetRoomLifecycle.mockRejectedValue(new TypeError('network unavailable'))
    const response = await getRoom('?reconcile=1')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ room: { status: 'active' } })
  })
})
