import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../..')
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), 'utf8')

const realtimeMigration = read('supabase/migrations/20260906_enable_social_realtime.sql')
const ageMigration = read('supabase/migrations/20260906_harden_age_verification_submission.sql')
const agePage = read('app/age-verification/page.tsx')

describe('realtime migration structure', () => {
  it('adds posts, comments and notifications to supabase_realtime idempotently', () => {
    for (const table of ['posts', 'comments', 'notifications']) {
      expect(realtimeMigration).toContain(`tablename = '${table}'`)
    }
    expect(realtimeMigration).toContain('alter publication supabase_realtime add table public.posts')
    expect(realtimeMigration).toContain('alter publication supabase_realtime add table public.comments')
    expect(realtimeMigration).toContain('alter publication supabase_realtime add table public.notifications')
  })

  it('sets replica identity full only on comments (needed for DELETE payload filtering)', () => {
    expect(realtimeMigration).toContain('alter table public.comments replica identity full')
    expect((realtimeMigration.match(/replica identity full/g) || []).length).toBe(1)
  })
})

describe('age verification hardening migration structure', () => {
  it('create RPC uses auth.uid() and server-side adult check, never client user_id', () => {
    expect(ageMigration).toContain('create or replace function public.create_age_verification_request()')
    expect(ageMigration).toContain('v_uid := auth.uid()')
    expect(ageMigration).toContain("v_birth_date > (current_date - interval '18 years')")
    expect(ageMigration).toContain('MINOR_NOT_ALLOWED')
    expect(ageMigration).toContain('BIRTH_DATE_REQUIRED')
  })

  it('create RPC reuses pending incomplete and blocks already-submitted', () => {
    expect(ageMigration).toContain('r.submitted_at is null')
    expect(ageMigration).toContain('REQUEST_ALREADY_SUBMITTED')
  })

  it('finalize RPC is authoritative: ownership, pending, paths and object existence', () => {
    expect(ageMigration).toContain('create or replace function public.finalize_age_verification_request(')
    expect(ageMigration).toContain('r.id = p_request_id and r.user_id = v_uid')
    expect(ageMigration).toContain('REQUEST_NOT_PENDING')
    expect(ageMigration).toContain('INVALID_DOCUMENT_PATH')
    expect(ageMigration).toContain('DOCUMENTS_NOT_UPLOADED')
    expect(ageMigration).toContain('submitted_at = now()')
  })

  it('both RPCs are SECURITY DEFINER with safe search_path', () => {
    expect((ageMigration.match(/security definer/g) || []).length).toBe(2)
    expect((ageMigration.match(/set search_path = ''/g) || []).length).toBeGreaterThanOrEqual(3)
  })

  it('grants go to authenticated only, anon is revoked', () => {
    expect(ageMigration).toContain('grant execute on function public.create_age_verification_request() to authenticated')
    expect(ageMigration).toContain('grant execute on function public.finalize_age_verification_request')
    expect(ageMigration).toContain('revoke all on function public.create_age_verification_request() from public, anon')
  })

  it('storage upload requires own pending not-submitted request + adult birth_date', () => {
    expect(ageMigration).toContain("(storage.foldername(name))[1] = auth.uid()::text")
    expect(ageMigration).toContain("(storage.foldername(name))[2] = r.id::text")
    expect(ageMigration).toContain('p.birth_date <= (current_date - interval \'18 years\')')
  })

  it('weak user policies are dropped; user document read is NOT reopened', () => {
    expect(ageMigration).toContain('drop policy if exists "Users can update own age verification files"')
    expect(ageMigration).toContain('drop policy if exists "Users can upload own age verification files"')
    expect(ageMigration).toContain('drop policy if exists "Users can update own pending age verification documents"')
    expect(ageMigration).not.toContain('for select')
  })

  it('cleanup delete policy is restricted to pending not-submitted own requests', () => {
    expect(ageMigration).toContain('for delete')
    expect(ageMigration).toContain('r.submitted_at is null')
  })
})

describe('age verification frontend structure', () => {
  it('does not use storage upsert (unique paths + upsert: false)', () => {
    expect(agePage).toContain('upsert: false')
    expect(agePage).not.toContain('upsert: true')
  })

  it('submits through authoritative RPCs, not direct table mutations', () => {
    expect(agePage).toContain("rpc('create_age_verification_request')")
    expect(agePage).toContain("rpc('finalize_age_verification_request'")
    expect(agePage).not.toContain(".from('age_verification_requests')\n      .insert(")
    expect(agePage).not.toContain("submitted_at: new Date().toISOString()")
  })

  it('hides the whole document form for minors (not merely disabled)', () => {
    // Form render is gated by canSubmit which requires !isMinor.
    expect(agePage).toMatch(/const canSubmit = hasBirthDate && !isMinor/)
    expect(agePage).toContain('{canSubmit && (')
    // Minor block is a hard UI block message.
    expect(agePage).toContain('Usuarios menores de 18 anos nao podem solicitar verificacao 18+')
  })

  it('upload path is scoped to <uid>/<requestId>/', () => {
    expect(agePage).toContain('`${profile.id}/${requestId}/${kind}-')
  })
})
