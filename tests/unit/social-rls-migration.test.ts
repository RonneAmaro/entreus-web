import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = 'supabase/migrations/20260901210000_enable_social_baseline_rls.sql'
const sql = readFileSync(migrationPath, 'utf8').toLowerCase()
const publicProfilePage = readFileSync('app/u/[username]/page.tsx', 'utf8')
const messagesPage = readFileSync('app/messages/[id]/page.tsx', 'utf8')
const signupPage = readFileSync('app/signup/page.tsx', 'utf8')
const ensureProfile = readFileSync('lib/auth/ensure-profile.ts', 'utf8')
const threadedComments = readFileSync(
  'supabase/migrations/20260818_fix_threaded_comment_actor_id_ambiguity.sql',
  'utf8',
).toLowerCase()
const threadedCommentReports = readFileSync(
  'supabase/migrations/20260717_add_threaded_comments_and_premium_feed.sql',
  'utf8',
).toLowerCase()
const postAnalytics = readFileSync(
  'supabase/migrations/20260626_create_post_analytics.sql',
  'utf8',
).toLowerCase()
const paidPosts = readFileSync(
  'supabase/migrations/20260708_add_platform_revenue_split.sql',
  'utf8',
).toLowerCase()

function policy(name: string) {
  const match = sql.match(new RegExp(`create policy ${name}[\\s\\S]*?;`))
  expect(match, `missing policy ${name}`).not.toBeNull()
  return match![0]
}

function expectNoBrowserUpdate(table: string) {
  expect(sql).not.toMatch(new RegExp(`grant[^;]*update[^;]*public\\.${table}[^;]*to (anon|authenticated)`))
  expect(sql).not.toMatch(new RegExp(`create policy [^;]*on public\\.${table}[^;]*for update`))
}

describe('social RLS baseline', () => {
  it('enables RLS on exactly the four social tables without FORCE RLS', () => {
    for (const table of ['blocks', 'follows', 'interests', 'profile_interests']) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`)
      expect(sql).toContain(`revoke all privileges on table public.${table} from public, anon, authenticated;`)
      expect(sql).toContain(`grant all privileges on table public.${table} to service_role, postgres;`)
    }
    expect(sql.match(/alter table public\.[a-z_]+ enable row level security;/g)).toHaveLength(4)
    expect(sql.match(/create policy /g)).toHaveLength(10)
    expect(sql).not.toContain('force row level security')
  })

  it('adds idempotent database constraints against self-blocks and self-follows', () => {
    expect(sql).toContain("conname = 'blocks_blocker_not_self'")
    expect(sql).toContain("conrelid = 'public.blocks'::regclass")
    expect(sql).toMatch(
      /add constraint blocks_blocker_not_self\s+check \(blocker_id <> blocked_id\);/,
    )
    expect(sql).toContain("conname = 'follows_follower_not_self'")
    expect(sql).toContain("conrelid = 'public.follows'::regclass")
    expect(sql).toMatch(
      /add constraint follows_follower_not_self\s+check \(follower_id <> following_id\);/,
    )
    expect(sql.match(/add constraint /g)).toHaveLength(2)
  })

  it('keeps blocks private to involved authenticated users and forbids anonymous access', () => {
    const selectPolicy = policy('blocks_select_involved')
    expect(selectPolicy).toContain('to authenticated')
    expect(selectPolicy).toContain('(select auth.uid()) = blocker_id')
    expect(selectPolicy).toContain('(select auth.uid()) = blocked_id')
    expect(sql).not.toMatch(/grant[^;]*public\.blocks[^;]*to anon/)
    expect(sql).not.toMatch(/create policy blocks_[^;]*to anon/)
  })

  it('allows authenticated users to create and delete only their own blocks', () => {
    const insertPolicy = policy('blocks_insert_own')
    const deletePolicy = policy('blocks_delete_own')
    expect(insertPolicy).toContain('(select auth.uid()) = blocker_id')
    expect(insertPolicy).toContain('blocker_id <> blocked_id')
    expect(deletePolicy).toContain('(select auth.uid()) = blocker_id')
    expect(sql).toContain('grant select, insert, delete on table public.blocks to authenticated;')
    expectNoBrowserUpdate('blocks')
  })

  it('keeps follow reads public while writes remain owned and non-self', () => {
    expect(policy('follows_select_public')).toContain('to anon, authenticated')
    expect(policy('follows_select_public')).toContain('using (true)')
    expect(policy('follows_insert_own')).toContain('(select auth.uid()) = follower_id')
    expect(policy('follows_insert_own')).toContain('follower_id <> following_id')
    expect(policy('follows_delete_own')).toContain('(select auth.uid()) = follower_id')
    expect(sql).toContain('grant select on table public.follows to anon, authenticated;')
    expect(sql).toContain('grant insert, delete on table public.follows to authenticated;')
    expect(sql).not.toMatch(/grant[^;]*insert[^;]*public\.follows[^;]*to anon/)
    expectNoBrowserUpdate('follows')
  })

  it('exposes interests as a read-only public catalog', () => {
    expect(policy('interests_select_public')).toContain('to anon, authenticated')
    expect(policy('interests_select_public')).toContain('using (true)')
    expect(sql).toContain('grant select on table public.interests to anon, authenticated;')
    expect(sql).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*public\.interests[^;]*to (anon|authenticated)/)
  })

  it('keeps profile interests private and writable only by the owning profile', () => {
    expect(policy('profile_interests_select_own')).toContain('(select auth.uid()) = profile_id')
    expect(policy('profile_interests_insert_own')).toContain('(select auth.uid()) = profile_id')
    expect(policy('profile_interests_delete_own')).toContain('(select auth.uid()) = profile_id')
    expect(sql).toContain('grant select, insert, delete on table public.profile_interests to authenticated;')
    expect(sql).not.toMatch(/grant[^;]*public\.profile_interests[^;]*to anon/)
    expectNoBrowserUpdate('profile_interests')
  })
})

describe('social RLS integration compatibility', () => {
  it('preserves followers-only checks in direct reads and SECURITY DEFINER functions', () => {
    expect(publicProfilePage).toContain('.from("follows")')
    expect(threadedComments).toContain('security definer')
    expect(threadedComments).toContain('from public.follows')
    expect(postAnalytics).toContain('security definer')
    expect(postAnalytics).toContain('from public.follows')
    expect(paidPosts).toContain('security definer')
    expect(paidPosts).toContain('from public.follows')
  })

  it('preserves block-aware comments and reports without redefining privileged functions', () => {
    expect(threadedComments).toContain('from public.blocks')
    expect(threadedCommentReports).toContain('create or replace function public.report_threaded_comment')
    expect(threadedCommentReports).toContain('security definer')
    expect(sql).not.toContain('create or replace function')
  })

  it('aligns block callers with insert/delete-only grants', () => {
    expect(messagesPage).toContain("onConflict: 'blocker_id,blocked_id'")
    expect(messagesPage).toContain('ignoreDuplicates: true')
    const blockFlow = publicProfilePage.slice(
      publicProfilePage.indexOf('async function handleToggleBlock'),
      publicProfilePage.indexOf('async function handleReportUser', publicProfilePage.indexOf('async function handleToggleBlock')),
    )
    expect(blockFlow).not.toContain('.eq("follower_id", profile.id)')
  })

  it('documents the application invariant that profile IDs are auth user IDs', () => {
    expect(signupPage).toContain('id: data.user.id')
    expect(ensureProfile).toContain(".eq('id', userId)")
    expect(ensureProfile).toContain("upsert({ id: userId }")
  })

  it('uses the corrected Batch 02 timestamp without changing its SQL slot', () => {
    expect(existsSync('supabase/migrations/20260901200000_harden_mercadopago_payment_rpcs.sql')).toBe(false)
    expect(existsSync('supabase/migrations/20260901202052_harden_mercadopago_payment_rpcs.sql')).toBe(true)
    expect(existsSync(migrationPath)).toBe(true)
  })
})
