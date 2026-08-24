import { describe, expect, it, vi } from 'vitest'
import { TwirpError } from 'livekit-server-sdk'
import { markMeetRoomEnded, stopActiveMeetRoomRecordings } from '@/lib/meet/room-end-server'

type Recording = { id: string; status: 'preparing' | 'recording' | 'processing' | 'cancelled'; ended_at: string | null; egress_id: string | null }

function recordingDatabase(rows: Recording[]) {
  const updates: Record<string, unknown>[] = []
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn(async () => ({ data: rows.filter((row) => row.status === 'preparing' || row.status === 'recording'), error: null })),
      })),
    })),
    update: vi.fn((update: Record<string, unknown>) => ({
      eq: vi.fn((_field: string, id: string) => ({
        in: vi.fn(async () => {
          updates.push(update)
          const row = rows.find((candidate) => candidate.id === id)
          if (row && (row.status === 'preparing' || row.status === 'recording')) Object.assign(row, update)
          return { error: null }
        }),
      })),
    })),
  }))
  return { db: { from } as never, updates, from }
}

describe('Meet room recording cleanup', () => {
  it('stops an active Egress and moves it to processing', async () => {
    const rows: Recording[] = [{ id: 'rec-a', status: 'recording', ended_at: null, egress_id: 'eg-a' }]
    const { db } = recordingDatabase(rows)
    const stop = vi.fn(async () => undefined)
    await stopActiveMeetRoomRecordings(db, 'room-id', '2026-08-24T12:00:00.000Z', stop)
    expect(stop).toHaveBeenCalledWith('eg-a')
    expect(rows[0].status).toBe('processing')
  })

  it('cancels a preparing recording that has no Egress id', async () => {
    const rows: Recording[] = [{ id: 'rec-a', status: 'preparing', ended_at: null, egress_id: null }]
    const { db } = recordingDatabase(rows)
    const stop = vi.fn(async () => undefined)
    await stopActiveMeetRoomRecordings(db, 'room-id', '2026-08-24T12:00:00.000Z', stop)
    expect(stop).not.toHaveBeenCalled()
    expect(rows[0].status).toBe('cancelled')
  })

  it('treats an already absent Egress as retry-safe', async () => {
    const rows: Recording[] = [{ id: 'rec-a', status: 'recording', ended_at: null, egress_id: 'eg-a' }]
    const { db } = recordingDatabase(rows)
    const stop = vi.fn(async () => { throw new TwirpError('Not Found', 'missing', 404, 'not_found') })
    await expect(stopActiveMeetRoomRecordings(db, 'room-id', '2026-08-24T12:00:00.000Z', stop)).resolves.toBeUndefined()
    expect(rows[0].status).toBe('processing')
  })

  it('does not advance persisted recording state after a real Egress failure', async () => {
    const rows: Recording[] = [{ id: 'rec-a', status: 'recording', ended_at: null, egress_id: 'eg-a' }]
    const { db } = recordingDatabase(rows)
    const stop = vi.fn(async () => { throw new Error('unavailable') })
    await expect(stopActiveMeetRoomRecordings(db, 'room-id', '2026-08-24T12:00:00.000Z', stop)).rejects.toThrow('unavailable')
    expect(rows[0].status).toBe('recording')
  })

  it('never rewrites an already ended room back to active', async () => {
    const endedRoom = { id: 'room-id', room_name: 'room-a', status: 'ended', ended_at: 'old' } as never
    const from = vi.fn()
    await expect(markMeetRoomEnded({ from } as never, endedRoom, 'new')).resolves.toBe(endedRoom)
    expect(from).not.toHaveBeenCalled()
  })
})
