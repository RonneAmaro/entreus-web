import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'supabase/migrations/20260824_add_meet_livekit_created_at.sql'

describe('Meet LiveKit marker migration', () => {
  it('adds only the nullable marker without default, backfill or policy changes', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
    expect(sql).toContain('alter table public.meet_rooms')
    expect(sql).toContain('add column if not exists livekit_created_at timestamptz null')
    expect(sql).not.toContain('default')
    expect(sql).not.toMatch(/update\s+public\.meet_rooms/)
    expect(sql).not.toContain('policy')
    expect(sql).not.toContain('row level security')
    expect(sql).not.toContain('storage')
    expect(sql).not.toContain('meet_room_members')
  })
})
