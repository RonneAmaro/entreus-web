import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'supabase/migrations/20260826_expand_private_message_attachments.sql'
const migration = readFileSync(migrationPath, 'utf8')

describe('private message attachment expansion migration', () => {
  it('creates pending-to-final server state with constrained lifecycle fields', () => {
    expect(migration).toContain('create table if not exists public.private_message_attachment_uploads')
    for (const field of [
      'user_id',
      'conversation_id',
      'message_id',
      'storage_provider',
      'storage_bucket',
      'storage_key',
      'final_storage_key',
      'attachment_id',
      'media_type',
      'file_name',
      'declared_mime',
      'declared_size',
      'position',
      'status',
      'expires_at',
      'confirmed_at',
      'created_at',
    ]) {
      expect(migration).toMatch(new RegExp(`\\b${field}\\b`))
    }
    expect(migration).toContain("status in ('pending', 'confirming', 'confirmed', 'cleanup_required')")
    expect(migration).toContain("storage_key like 'private/messages/pending/%'")
    expect(migration).toContain("final_storage_key like 'private/messages/final/%'")
  })

  it('enables RLS and denies every browser role access to pending rows', () => {
    expect(migration).toContain('alter table public.private_message_attachment_uploads enable row level security')
    expect(migration).toContain('revoke all on table public.private_message_attachment_uploads from public, anon, authenticated')
    expect(migration).toContain('grant select, insert, update, delete on table public.private_message_attachment_uploads to service_role')
    expect(migration).not.toMatch(/create policy[\s\S]{0,240}private_message_attachment_uploads[\s\S]{0,240}to (anon|authenticated)/i)
  })

  it('is expansion-only and preserves the current attachment UI contract', () => {
    expect(migration).toContain('add column if not exists needs_deeper_inspection boolean not null default false')
    expect(migration).not.toMatch(/revoke\s+(insert|update|delete|all)[\s\S]{0,120}message_attachments/i)
    expect(migration).not.toMatch(/drop\s+policy[\s\S]{0,120}message_attachments/i)
    expect(migration).not.toMatch(/create\s+policy[\s\S]{0,120}message_attachments/i)
    expect(migration).not.toContain('on public.message_attachments(message_id, position)')
    expect(migration).not.toContain('message_attachments_private_storage_key_idx')
  })

  it('keeps active pending positions unique without imposing the final legacy constraint yet', () => {
    expect(migration).toContain('create unique index if not exists private_message_attachment_uploads_active_position_idx')
    expect(migration).toContain("where status in ('pending', 'confirming')")
    expect(migration).toContain('add UNIQUE(message_id, position) only after preflight/deduplication')
  })

  it('contains no contract migration or remote execution command', () => {
    expect(migrationPath).toMatch(/20260826_expand/)
    expect(migration).toContain('later contract migration')
    expect(migration).not.toMatch(/supabase\s+(db push|migration up|link)/i)
  })
})
