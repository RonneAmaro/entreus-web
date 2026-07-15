import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const createSql = readFileSync(
  'supabase/migrations/20260714_create_profile_media_cleanup_runs.sql',
  'utf8',
).toLowerCase()

const privilegeSql = readFileSync(
  'supabase/migrations/20260715_tighten_profile_media_cleanup_runs_privileges.sql',
  'utf8',
).toLowerCase()

const normalizeSql = (value: string) => value.replace(/\s+/g, ' ').trim()

const normalizedCreateSql = normalizeSql(createSql)
const normalizedPrivilegeSql = normalizeSql(privilegeSql)

describe('profile media cleanup run migrations', () => {
  it('creates constrained history with RLS and browser roles denied', () => {
    expect(createSql).toContain('create table public.profile_media_cleanup_runs')
    expect(createSql).toContain('enable row level security')
    expect(createSql).not.toContain('create policy')

    for (const role of ['public', 'anon', 'authenticated']) {
      expect(normalizedCreateSql).toContain(
        `revoke all privileges on table public.profile_media_cleanup_runs from ${role};`,
      )
    }

    expect(createSql).toContain("where status = 'started'")
    expect(createSql).toContain('create unique index')
    expect(createSql).toContain('claimed_count >= 0')
    expect(createSql).toContain('duration_ms bigint')
    expect(createSql).toContain('requested_duration_ms bigint')
    expect(createSql).toContain('requested_claimed_count is null')
    expect(createSql).toContain('duration_ms >= 0')
    expect(createSql).toContain('char_length(error_code) <= 80')
    expect(createSql).toContain("mode = 'dry_run'")
    for (const forbiddenColumn of ['storage_key', 'bucket', 'endpoint', 'url', 'secret', 'payload', 'stack']) {
      expect(createSql).not.toMatch(new RegExp(`\\b${forbiddenColumn}\\b`))
    }
  })

  it('limits service role table privileges to non-destructive operations', () => {
    expect(normalizedPrivilegeSql).toContain(
      'revoke all privileges on table public.profile_media_cleanup_runs from service_role;',
    )

    expect(normalizedPrivilegeSql).toContain(
      'grant select, insert, update on table public.profile_media_cleanup_runs to service_role;',
    )

    expect(privilegeSql).not.toMatch(
      /grant[^;]*(delete|truncate|references|trigger)[^;]*service_role/,
    )
  })

  it('creates hardened start and completion RPCs with stale recovery', () => {
    expect(createSql).toContain('start_profile_media_cleanup_run')
    expect(createSql).toContain('complete_profile_media_cleanup_run')
    expect(createSql.match(/security definer/g)).toHaveLength(2)
    expect(createSql.match(/set search_path = public/g)).toHaveLength(2)
    expect(createSql).toContain(
      'requested_stale_timeout_minutes integer default 30',
    )
    expect(createSql).toContain("status = 'expired'")
    expect(createSql).toContain("error_code = 'stale_run_expired'")
    expect(createSql).toContain(
      'update public.profile_media_cleanup_runs as cleanup_run',
    )
    expect(createSql).toContain("cleanup_run.status = 'started'")
    expect(createSql).toContain('when unique_violation')
    expect(createSql).toContain("pg_advisory_xact_lock(hashtext('profile_media_cleanup_runs:start'))")
    expect(createSql.match(/grant execute on function/g)).toHaveLength(2)
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(normalizedCreateSql).toContain(
        `revoke all on function public.start_profile_media_cleanup_run(text, integer) from ${role};`,
      )
      expect(normalizedCreateSql).toContain(
        `revoke all on function public.complete_profile_media_cleanup_run(uuid, text, text, integer, integer, integer, integer, integer, integer, integer, bigint, text) from ${role};`,
      )
    }
  })

  it('configures exactly one safe Vercel cron', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))

    expect(vercel.crons).toEqual([
      {
        path: '/api/internal/cron/profile-media-orphan-dry-run',
        schedule: '30 3 * * *',
      },
    ])

    expect(JSON.stringify(vercel)).not.toMatch(
      /\?|secret|profile-media-orphan-cleanup"/i,
    )
  })
})
