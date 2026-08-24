import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  userId: 'owner-a',
  room: null as null | Record<string, unknown>,
  requireUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getRoomByName: vi.fn(),
  markMeetRoomEnded: vi.fn(),
  stopActiveMeetRoomRecordings: vi.fn(),
  deleteLiveKitMeetRoom: vi.fn(),
}))

vi.mock('@/lib/meet-server', () => ({
  requireUser: state.requireUser,
  getSupabaseAdmin: state.getSupabaseAdmin,
  getRoomByName: state.getRoomByName,
  jsonError: (message: string, status: number) => Response.json({ ok: false, error: message }, { status }),
}))

vi.mock('@/lib/meet/room-end-server', () => ({
  markMeetRoomEnded: state.markMeetRoomEnded,
  stopActiveMeetRoomRecordings: state.stopActiveMeetRoomRecordings,
}))

vi.mock('@/lib/meet/livekit-room-server', () => ({
  deleteLiveKitMeetRoom: state.deleteLiveKitMeetRoom,
}))

vi.mock('@/lib/logging/safe-logger', () => ({ logServerEvent: vi.fn() }))

function room(status: 'active' | 'ended' | 'expired' = 'active') {
  return {
    id: 'room-id', room_name: 'room-a', owner_id: 'owner-a', status,
    ended_at: status === 'ended' ? '2026-08-24T10:00:00.000Z' : null,
  }
}

async function endRequest() {
  const { POST } = await import('@/app/api/meet/rooms/[roomName]/end/route')
  return POST(
    new Request('http://localhost/api/meet/rooms/room-a/end', { method: 'POST', headers: { authorization: 'Bearer test' } }),
    { params: Promise.resolve({ roomName: 'room-a' }) },
  )
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.userId = 'owner-a'
  state.room = room()
  state.requireUser.mockImplementation(async () => ({ user: { id: state.userId } }))
  state.getSupabaseAdmin.mockReturnValue({})
  state.getRoomByName.mockImplementation(async () => state.room)
  state.markMeetRoomEnded.mockImplementation(async (_db: unknown, value: Record<string, unknown>, endedAt: string) => ({ ...value, status: 'ended', ended_at: value.ended_at || endedAt }))
  state.stopActiveMeetRoomRecordings.mockResolvedValue(undefined)
  state.deleteLiveKitMeetRoom.mockResolvedValue({ deleted: true })
})

describe('owner Meet room end endpoint', () => {
  it('allows the authenticated creator to end the room', async () => {
    const response = await endRequest()
    expect(response.status).toBe(200)
    expect(state.markMeetRoomEnded).toHaveBeenCalledTimes(1)
  })

  it('stops active Egress before deleting the room', async () => {
    await endRequest()
    expect(state.stopActiveMeetRoomRecordings).toHaveBeenCalledWith(expect.anything(), 'room-id', expect.any(String))
    expect(state.stopActiveMeetRoomRecordings.mock.invocationCallOrder.at(0)!).toBeLessThan(state.deleteLiveKitMeetRoom.mock.invocationCallOrder.at(0)!)
  })

  it('rejects a participant who is not the creator', async () => {
    state.userId = 'participant-a'
    expect((await endRequest()).status).toBe(403)
    expect(state.markMeetRoomEnded).not.toHaveBeenCalled()
  })

  it('does not grant a platform admin implicit owner permission', async () => {
    state.userId = 'platform-admin'
    expect((await endRequest()).status).toBe(403)
    expect(state.deleteLiveKitMeetRoom).not.toHaveBeenCalled()
  })

  it('rejects an unrelated external user', async () => {
    state.userId = 'external-user'
    expect((await endRequest()).status).toBe(403)
    expect(state.stopActiveMeetRoomRecordings).not.toHaveBeenCalled()
  })

  it('keeps an already ended room idempotent and preserves ended_at', async () => {
    state.room = room('ended')
    const response = await endRequest()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ endedAt: '2026-08-24T10:00:00.000Z' })
  })

  it('keeps two concurrent owner end calls retry-safe', async () => {
    const [first, second] = await Promise.all([endRequest(), endRequest()])
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(state.markMeetRoomEnded).toHaveBeenCalledTimes(2)
  })

  it('does not transform an expired room into ended', async () => {
    state.room = room('expired')
    expect((await endRequest()).status).toBe(409)
    expect(state.markMeetRoomEnded).not.toHaveBeenCalled()
  })

  it('keeps the room logically ended and attempts delete when Egress cleanup fails', async () => {
    state.stopActiveMeetRoomRecordings.mockRejectedValue(new Error('egress unavailable'))
    const response = await endRequest()
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ ended: true, cleanupPending: true })
    expect(state.deleteLiveKitMeetRoom).toHaveBeenCalledWith('room-a')
  })

  it('reports a real deleteRoom cleanup failure without resurrecting the room', async () => {
    state.deleteLiveKitMeetRoom.mockRejectedValue(new Error('livekit unavailable'))
    const response = await endRequest()
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ ended: true, cleanupPending: true })
    expect(state.markMeetRoomEnded).toHaveBeenCalledTimes(1)
    expect(state.deleteLiveKitMeetRoom).toHaveBeenCalledTimes(1)
  })
})
