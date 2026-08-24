import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MeetRoom } from '@/lib/meet-server'
import type { LiveKitRoomService } from '@/lib/meet/livekit-room-server'

const state = vi.hoisted(() => ({
  currentRoom: null as MeetRoom | null,
  getRoomByName: vi.fn(),
  markMeetRoomEnded: vi.fn(),
  stopActiveMeetRoomRecordings: vi.fn(),
}))

vi.mock('@/lib/meet-server', () => ({ getRoomByName: state.getRoomByName }))
vi.mock('@/lib/meet/room-end-server', () => ({
  markMeetRoomEnded: state.markMeetRoomEnded,
  stopActiveMeetRoomRecordings: state.stopActiveMeetRoomRecordings,
}))

import {
  markMeetRoomLiveKitCreated,
  reconcileMeetRoomLifecycle,
} from '@/lib/meet/room-lifecycle-reconciliation-server'

function room(overrides: Partial<MeetRoom> = {}): MeetRoom {
  return {
    id: 'room-id',
    room_name: 'room-a',
    title: null,
    owner_id: 'owner-a',
    plan: 'free',
    status: 'active',
    max_duration_minutes: 20,
    starts_at: '2026-08-24T10:00:00.000Z',
    expires_at: '2026-08-24T10:20:00.000Z',
    ended_at: null,
    livekit_created_at: '2026-08-24T10:01:00.000Z',
    is_recording_enabled: false,
    is_translation_enabled: false,
    ...overrides,
  }
}

function service(listRooms: LiveKitRoomService['listRooms']): LiveKitRoomService {
  return {
    listRooms,
    createRoom: vi.fn(async ({ name }) => ({ name })),
    deleteRoom: vi.fn(async () => undefined),
  }
}

function markerDatabase(initialRoom: MeetRoom, updateError: unknown = null) {
  let current = initialRoom
  const update = vi.fn((values: Partial<MeetRoom>) => {
    const builder = {
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (updateError) return { data: null, error: updateError }
        if (current.status === 'active' && !current.livekit_created_at) {
          current = { ...current, ...values }
          state.currentRoom = current
          return { data: current, error: null }
        }
        return { data: null, error: null }
      }),
    }
    return builder
  })
  return {
    supabase: { from: vi.fn(() => ({ update })) } as unknown as SupabaseClient,
    update,
    current: () => current,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.currentRoom = room()
  state.getRoomByName.mockImplementation(async () => state.currentRoom)
  state.markMeetRoomEnded.mockImplementation(async (_db: unknown, value: MeetRoom, endedAt: string) => {
    if (state.currentRoom?.status === 'ended') return state.currentRoom
    state.currentRoom = { ...value, status: 'ended', ended_at: value.ended_at || endedAt }
    return state.currentRoom
  })
  state.stopActiveMeetRoomRecordings.mockResolvedValue(undefined)
})

describe('Meet room LiveKit marker', () => {
  it('persists the first confirmed LiveKit existence server-side', async () => {
    const initial = room({ livekit_created_at: null })
    const db = markerDatabase(initial)
    const marked = await markMeetRoomLiveKitCreated(db.supabase, initial, '2026-08-24T10:02:00.000Z')
    expect(marked.livekit_created_at).toBe('2026-08-24T10:02:00.000Z')
    expect(db.update).toHaveBeenCalledWith({ livekit_created_at: '2026-08-24T10:02:00.000Z' })
  })

  it('does not overwrite an existing marker', async () => {
    const initial = room()
    const db = markerDatabase(initial)
    await expect(markMeetRoomLiveKitCreated(db.supabase, initial, 'new')).resolves.toBe(initial)
    expect(db.update).not.toHaveBeenCalled()
  })

  it('fails closed when marker persistence fails', async () => {
    const initial = room({ livekit_created_at: null })
    const db = markerDatabase(initial, new Error('database unavailable'))
    await expect(markMeetRoomLiveKitCreated(db.supabase, initial)).rejects.toThrow('database unavailable')
  })

  it('keeps one coherent timestamp for two concurrent marker writes', async () => {
    const initial = room({ livekit_created_at: null })
    state.currentRoom = initial
    const db = markerDatabase(initial)
    const [first, second] = await Promise.all([
      markMeetRoomLiveKitCreated(db.supabase, initial, '2026-08-24T10:02:00.000Z'),
      markMeetRoomLiveKitCreated(db.supabase, initial, '2026-08-24T10:03:00.000Z'),
    ])
    expect(first.livekit_created_at).toBe('2026-08-24T10:02:00.000Z')
    expect(second.livekit_created_at).toBe(first.livekit_created_at)
  })
})

describe('Meet room lifecycle reconciliation', () => {
  it('does not query LiveKit or end an active room without marker', async () => {
    const listRooms = vi.fn(async () => [])
    const value = room({ livekit_created_at: null })
    const result = await reconcileMeetRoomLifecycle({} as SupabaseClient, value, { service: service(listRooms) })
    expect(result.room).toBe(value)
    expect(result.checkedLiveKit).toBe(false)
    expect(listRooms).not.toHaveBeenCalled()
  })

  it('keeps an occupied LiveKit room active', async () => {
    const listRooms = vi.fn(async () => [{ name: 'room-a', numParticipants: 2 }])
    const result = await reconcileMeetRoomLifecycle({} as SupabaseClient, room(), { service: service(listRooms) })
    expect(result.room.status).toBe('active')
    expect(state.markMeetRoomEnded).not.toHaveBeenCalled()
  })

  it('keeps an existing empty room active during its LiveKit grace period', async () => {
    const listRooms = vi.fn(async () => [{ name: 'room-a', numParticipants: 0 }])
    const result = await reconcileMeetRoomLifecycle({} as SupabaseClient, room(), { service: service(listRooms) })
    expect(result.room.status).toBe('active')
  })

  it('allows reconnect while the empty LiveKit room still exists', async () => {
    const liveKitRoom = { name: 'room-a', numParticipants: 1 }
    const result = await reconcileMeetRoomLifecycle({} as SupabaseClient, room(), {
      service: service(vi.fn(async () => [liveKitRoom])),
    })
    expect(result.liveKitRoom).toBe(liveKitRoom)
    expect(result.room.status).toBe('active')
  })

  it('ends a marked room after LiveKit proves it no longer exists', async () => {
    const result = await reconcileMeetRoomLifecycle({} as SupabaseClient, room(), {
      service: service(vi.fn(async () => [])),
      now: () => new Date('2026-08-24T10:05:00.000Z'),
    })
    expect(result.room.status).toBe('ended')
    expect(result.room.ended_at).toBe('2026-08-24T10:05:00.000Z')
    expect(state.stopActiveMeetRoomRecordings).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['LiveKit 500', new Error('500')],
    ['network failure', new TypeError('fetch failed')],
    ['auth failure', new Error('401')],
  ])('does not end the room on %s', async (_label, error) => {
    await expect(reconcileMeetRoomLifecycle({} as SupabaseClient, room(), {
      service: service(vi.fn(async () => { throw error })),
    })).rejects.toBe(error)
    expect(state.markMeetRoomEnded).not.toHaveBeenCalled()
  })

  it.each(['ended', 'expired'] as const)('does not query or resurrect a %s room', async (status) => {
    const listRooms = vi.fn(async () => [])
    const value = room({ status })
    const result = await reconcileMeetRoomLifecycle({} as SupabaseClient, value, { service: service(listRooms) })
    expect(result.room.status).toBe(status)
    expect(listRooms).not.toHaveBeenCalled()
  })

  it('keeps ended_at stable across concurrent reconciliations', async () => {
    const value = room()
    state.currentRoom = value
    const options = {
      service: service(vi.fn(async () => [])),
      now: () => new Date('2026-08-24T10:05:00.000Z'),
    }
    const [first, second] = await Promise.all([
      reconcileMeetRoomLifecycle({} as SupabaseClient, value, options),
      reconcileMeetRoomLifecycle({} as SupabaseClient, value, options),
    ])
    expect(first.room.ended_at).toBe('2026-08-24T10:05:00.000Z')
    expect(second.room.ended_at).toBe(first.room.ended_at)
  })

  it('covers the human departure flow without ending before the grace period', async () => {
    const listRooms = vi.fn()
      .mockResolvedValueOnce([{ name: 'room-a', numParticipants: 0 }])
      .mockResolvedValueOnce([])
    const livekit = service(listRooms)
    const duringGrace = await reconcileMeetRoomLifecycle({} as SupabaseClient, room(), { service: livekit })
    const afterTimeout = await reconcileMeetRoomLifecycle({} as SupabaseClient, duringGrace.room, { service: livekit })
    expect(duringGrace.room.status).toBe('active')
    expect(afterTimeout.room.status).toBe('ended')
  })
})
