import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessToken } from 'livekit-server-sdk'

const state = vi.hoisted(() => ({
  roomName: 'room-a',
  roomStatus: 'active' as 'active' | 'ended' | 'expired',
  endedAt: null as string | null,
  updateCount: 0,
  getSupabaseAdmin: vi.fn(),
  getRoomByName: vi.fn(),
  getLiveKitServerConfig: vi.fn(),
  finishMeetRoomAfterLiveKitEnded: vi.fn(),
}))

vi.mock('@/lib/meet-server', () => ({
  getSupabaseAdmin: state.getSupabaseAdmin,
  getRoomByName: state.getRoomByName,
}))
vi.mock('@/lib/meet/livekit-room-server', () => ({ getLiveKitServerConfig: state.getLiveKitServerConfig }))
vi.mock('@/lib/meet/room-lifecycle-reconciliation-server', () => ({
  finishMeetRoomAfterLiveKitEnded: state.finishMeetRoomAfterLiveKitEnded,
}))
vi.mock('@/lib/logging/safe-logger', () => ({ logServerEvent: vi.fn() }))

async function signedRequest(body: string, overrideBody = body) {
  const token = new AccessToken('key', 'secret')
  token.sha256 = createHash('sha256').update(body).digest('base64')
  return new Request('http://localhost/api/livekit/webhook', {
    method: 'POST',
    headers: { authorization: await token.toJwt(), 'content-type': 'application/webhook+json' },
    body: overrideBody,
  })
}

function roomFinishedBody(name = 'room-a') {
  return JSON.stringify({ event: 'room_finished', room: { sid: 'RM_test', name } })
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.roomName = 'room-a'
  state.roomStatus = 'active'
  state.endedAt = null
  state.updateCount = 0
  state.getSupabaseAdmin.mockReturnValue({})
  state.getRoomByName.mockImplementation(async (_supabase: unknown, roomName: string) => {
    if (roomName !== state.roomName) return null
    return { id: 'room-id', room_name: roomName, status: state.roomStatus, ended_at: state.endedAt }
  })
  state.finishMeetRoomAfterLiveKitEnded.mockImplementation(async (_supabase: unknown, room: { status: string; ended_at: string | null }) => {
    if (state.roomStatus === 'active') {
      state.roomStatus = 'ended'
      state.endedAt ||= new Date().toISOString()
      state.updateCount += 1
    }
    return {
      room: { ...room, status: state.roomStatus, ended_at: state.endedAt },
      cleanupError: null,
    }
  })
  state.getLiveKitServerConfig.mockReturnValue({ url: 'wss://livekit.example.com', apiKey: 'key', apiSecret: 'secret' })
})

describe('LiveKit webhook security and idempotency', () => {
  it('rejects a request without Authorization', async () => {
    const { POST } = await import('@/app/api/livekit/webhook/route')
    const response = await POST(new Request('http://localhost/api/livekit/webhook', { method: 'POST', body: roomFinishedBody() }))
    expect(response.status).toBe(401)
    expect(state.updateCount).toBe(0)
  })

  it('rejects an invalid Authorization token', async () => {
    const { POST } = await import('@/app/api/livekit/webhook/route')
    const response = await POST(new Request('http://localhost/api/livekit/webhook', { method: 'POST', headers: { authorization: 'invalid' }, body: roomFinishedBody() }))
    expect(response.status).toBe(401)
  })

  it('rejects a body changed after signing', async () => {
    const original = roomFinishedBody()
    const request = await signedRequest(original, roomFinishedBody('room-tampered'))
    const { POST } = await import('@/app/api/livekit/webhook/route')
    expect((await POST(request)).status).toBe(401)
    expect(state.updateCount).toBe(0)
  })

  it('marks active rooms ended for a valid room_finished event', async () => {
    const { POST } = await import('@/app/api/livekit/webhook/route')
    expect((await POST(await signedRequest(roomFinishedBody()))).status).toBe(200)
    expect(state.roomStatus).toBe('ended')
    expect(state.endedAt).toBeTruthy()
  })

  it('keeps duplicate room_finished delivery idempotent', async () => {
    const { POST } = await import('@/app/api/livekit/webhook/route')
    await POST(await signedRequest(roomFinishedBody()))
    const originalEndedAt = state.endedAt
    await POST(await signedRequest(roomFinishedBody()))
    expect(state.updateCount).toBe(1)
    expect(state.endedAt).toBe(originalEndedAt)
  })

  it('does not leak whether an unknown room exists', async () => {
    const { POST } = await import('@/app/api/livekit/webhook/route')
    const known = await POST(await signedRequest(roomFinishedBody()))
    state.roomStatus = 'active'
    const unknown = await POST(await signedRequest(roomFinishedBody('unknown-room')))
    expect(unknown.status).toBe(known.status)
    expect(await unknown.json()).toEqual(await known.json())
  })

  it('does not overwrite ended_at for an already ended room', async () => {
    state.roomStatus = 'ended'
    state.endedAt = '2026-08-24T10:00:00.000Z'
    const { POST } = await import('@/app/api/livekit/webhook/route')
    expect((await POST(await signedRequest(roomFinishedBody()))).status).toBe(200)
    expect(state.endedAt).toBe('2026-08-24T10:00:00.000Z')
  })

  it('does not transform an expired room into ended', async () => {
    state.roomStatus = 'expired'
    const { POST } = await import('@/app/api/livekit/webhook/route')
    expect((await POST(await signedRequest(roomFinishedBody()))).status).toBe(200)
    expect(state.roomStatus).toBe('expired')
  })
})
