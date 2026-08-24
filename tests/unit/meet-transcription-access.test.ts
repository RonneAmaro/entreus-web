import { beforeEach, describe, expect, it, vi } from 'vitest'

const accessState = vi.hoisted(() => ({
  admin: { client: 'service-role' } as Record<string, unknown>,
  member: null as null | Record<string, unknown>,
  getMembership: vi.fn(),
}))

vi.mock('@/lib/meet-server', () => ({
  canJoinRoom: (member: { status?: string } | null) => member?.status === 'approved',
  canModerate: (member: { status?: string; role?: string } | null) => Boolean(
    member?.status === 'approved' && ['owner', 'admin'].includes(member.role ?? ''),
  ),
  expireRoomIfNeeded: vi.fn(async (_supabase, room) => room),
  getMembership: accessState.getMembership,
  getRoomByName: vi.fn(async () => ({
    id: 'room-a',
    room_name: 'room-name',
    owner_id: 'owner-a',
    status: 'active',
    expires_at: '2099-01-01T00:00:00.000Z',
  })),
  getSupabaseAdmin: () => accessState.admin,
  hasRoomExpired: () => false,
  jsonError: (message: string, status: number) => Response.json({ ok: false, error: message }, { status }),
  requireUser: vi.fn(async () => ({ user: { id: 'user-a' } })),
}))

import { getMeetTranscriptionAccess } from '@/lib/meet/transcription-server'

beforeEach(() => {
  vi.clearAllMocks()
  accessState.member = {
    id: 'member-a',
    room_id: 'room-a',
    user_id: 'user-a',
    role: 'participant',
    status: 'approved',
  }
  accessState.getMembership.mockImplementation(async () => accessState.member)
})

describe('Meet transcription privileged browser access', () => {
  it('rejects a revoked member even though the lookup uses the service-role client', async () => {
    accessState.member = { ...accessState.member, status: 'left' }

    const result = await getMeetTranscriptionAccess(
      new Request('http://localhost/api/meet/rooms/room-name/transcription'),
      'room-name',
    )

    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error?.status).toBe(403)
    expect(accessState.getMembership).toHaveBeenCalledWith(accessState.admin, 'room-a', 'user-a')
  })

  it('allows the current approved member while preserving server-side room and user binding', async () => {
    const result = await getMeetTranscriptionAccess(
      new Request('http://localhost/api/meet/rooms/room-name/transcription'),
      'room-name',
    )

    expect(result).toMatchObject({
      supabase: accessState.admin,
      room: { id: 'room-a' },
      membership: { id: 'member-a', room_id: 'room-a', user_id: 'user-a', status: 'approved' },
      isModerator: false,
    })
  })
})
