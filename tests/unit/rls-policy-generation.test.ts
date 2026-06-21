import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260621_harden_adult_content_rls.sql'), 'utf8')
describe('Package 38 RLS proposal', () => {
  it('covers posts and interactions without modifying storage objects', () => {
    expect(migration).toContain('alter table public.posts enable row level security')
    expect(migration).toContain('alter table public.comments enable row level security')
    expect(migration).toContain('alter table public.likes enable row level security')
    expect(migration).toContain('Adult-safe post media select')
    expect(migration).toContain('Adult-safe repost select')
    expect(migration).not.toContain('alter table storage.objects')
  })
})
