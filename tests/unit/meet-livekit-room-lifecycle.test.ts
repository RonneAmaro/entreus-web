import { describe, expect, it, vi } from 'vitest'
import { TwirpError } from 'livekit-server-sdk'
import {
  MEET_ROOM_DEPARTURE_TIMEOUT_SECONDS,
  MEET_ROOM_EMPTY_TIMEOUT_SECONDS,
  deleteLiveKitMeetRoom,
  ensureLiveKitMeetRoom,
  type LiveKitRoomService,
} from '@/lib/meet/livekit-room-server'

function service(overrides: Partial<LiveKitRoomService> = {}): LiveKitRoomService {
  return {
    listRooms: vi.fn(async () => []),
    createRoom: vi.fn(async ({ name }) => ({ name })),
    deleteRoom: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('Meet LiveKit room lifecycle', () => {
  it('creates a new room with emptyTimeout = 120', async () => {
    const client = service()
    await ensureLiveKitMeetRoom('room-a', client)
    expect(client.createRoom).toHaveBeenCalledWith(expect.objectContaining({ emptyTimeout: 120 }))
    expect(MEET_ROOM_EMPTY_TIMEOUT_SECONDS).toBe(120)
  })

  it('creates a new room with departureTimeout = 120', async () => {
    const client = service()
    await ensureLiveKitMeetRoom('room-a', client)
    expect(client.createRoom).toHaveBeenCalledWith(expect.objectContaining({ departureTimeout: 120 }))
    expect(MEET_ROOM_DEPARTURE_TIMEOUT_SECONDS).toBe(120)
  })

  it('does not create a duplicate when the room already exists', async () => {
    const client = service({ listRooms: vi.fn(async () => [{ name: 'room-a' }]) })
    await expect(ensureLiveKitMeetRoom('room-a', client)).resolves.toMatchObject({ created: false })
    expect(client.createRoom).not.toHaveBeenCalled()
  })

  it('recovers from a simultaneous create conflict after confirming the room exists', async () => {
    const listRooms = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: 'room-a' }])
    const client = service({
      listRooms,
      createRoom: vi.fn(async () => {
        throw new TwirpError('Conflict', 'already exists', 409, 'already_exists')
      }),
    })
    await expect(ensureLiveKitMeetRoom('room-a', client)).resolves.toMatchObject({ created: false })
    expect(listRooms).toHaveBeenCalledTimes(2)
  })

  it('fails closed when a create conflict cannot be confirmed', async () => {
    const conflict = new TwirpError('Conflict', 'already exists', 409, 'already_exists')
    const client = service({
      createRoom: vi.fn(async () => { throw conflict }),
    })
    await expect(ensureLiveKitMeetRoom('room-a', client)).rejects.toBe(conflict)
  })

  it('propagates temporary LiveKit failures', async () => {
    const unavailable = new TwirpError('Unavailable', 'temporary', 503, 'unavailable')
    const client = service({ listRooms: vi.fn(async () => { throw unavailable }) })
    await expect(ensureLiveKitMeetRoom('room-a', client)).rejects.toBe(unavailable)
  })

  it('deletes an existing LiveKit room', async () => {
    const client = service()
    await expect(deleteLiveKitMeetRoom('room-a', client)).resolves.toEqual({ deleted: true })
    expect(client.deleteRoom).toHaveBeenCalledWith('room-a')
  })

  it('treats an already absent LiveKit room as idempotent', async () => {
    const client = service({
      deleteRoom: vi.fn(async () => {
        throw new TwirpError('Not Found', 'missing', 404, 'not_found')
      }),
    })
    await expect(deleteLiveKitMeetRoom('room-a', client)).resolves.toEqual({ deleted: false })
  })
})
