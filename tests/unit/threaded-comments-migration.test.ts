import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/20260717_add_threaded_comments_and_premium_feed.sql',
  'utf8',
)

describe('threaded comments migration', () => {
  it('is incremental, nullable for legacy roots and ordered after Package 51', () => {
    expect(sql).toContain('20260716_add_unified_expression_attachments.sql')
    expect(sql).toMatch(/parent_comment_id uuid null/)
    expect(sql).toContain('add column if not exists')
  })

  it('adds a restrictive self-reference and tree indexes', () => {
    expect(sql).toMatch(/foreign key \(parent_comment_id\) references public\.comments\(id\) on delete restrict/)
    expect(sql).toContain('comments_roots_cursor_idx')
    expect(sql).toContain('comments_replies_cursor_idx')
    expect(sql).toContain('comments_post_parent_idx')
  })

  it('derives depth and rejects cross-post parents, missing parents and self cycles', () => {
    expect(sql).toContain("raise exception 'parent_comment_not_found'")
    expect(sql).toContain("raise exception 'parent_comment_post_mismatch'")
    expect(sql).toContain("raise exception 'comment_cycle'")
    expect(sql).toContain('new.depth := parent_row.depth + 1')
  })

  it('makes the parent, post, author and depth immutable', () => {
    for (const field of ['parent_comment_id', 'post_id', 'user_id', 'depth']) {
      expect(sql).toContain(`new.${field} is distinct from old.${field}`)
    }
    expect(sql).toContain("raise exception 'comment_relationship_is_immutable'")
  })

  it('enforces the maximum depth server-side', () => {
    expect(sql).toContain('comments_depth_check check (depth between 0 and 5)')
    expect(sql).toContain('if parent_row.depth >= 5')
  })

  it('ignores client authors and verifies post visibility server-side', () => {
    expect(sql).toContain('actor_id uuid := auth.uid()')
    expect(sql).not.toMatch(/create_threaded_comment\([\s\S]*p_user_id/)
    expect(sql).toContain('public.can_view_post_for_rls')
    expect(sql).toContain("post_row.visibility = 'private'")
    expect(sql).toContain("post_row.visibility = 'followers'")
    expect(sql).toContain('from public.follows')
    expect(sql).toContain('from public.blocks')
  })

  it('validates empty and expression-only submissions', () => {
    expect(sql).toContain("normalized_content = '' and p_expression is null")
    expect(sql).toContain('public.is_valid_expression_asset(p_expression)')
  })

  it('maintains reliable reply counts transactionally and can rebuild them', () => {
    expect(sql).toContain('after insert or delete on public.comments')
    expect(sql).toContain('set reply_count = reply_count + 1')
    expect(sql).toContain('set reply_count = greatest(reply_count - 1, 0)')
    expect(sql).toMatch(/update public\.comments c[\s\S]*select count\(\*\)::integer/)
  })

  it('soft-deletes nodes with children while removing content and media', () => {
    expect(sql).toContain('if target.reply_count > 0')
    expect(sql).toMatch(/content = '', expression = null, deleted_at = now\(\)/)
    expect(sql).toContain('delete from public.comment_media where comment_id = p_comment_id')
  })

  it('checks edit/delete authorization and disallows edits after removal', () => {
    expect(sql).toContain('(user_id = auth.uid() or public.is_admin())')
    expect(sql).toContain('and deleted_at is null')
    expect(sql).toContain("raise exception 'comment_delete_forbidden'")
  })

  it('deduplicates creation retries and direct-author notifications', () => {
    expect(sql).toContain('comments_user_request_once_idx')
    expect(sql).toContain('notifications_comment_reply_once_idx')
    expect(sql).toContain('parent_row.user_id <> actor_id')
    expect(sql).toContain('on conflict (user_id, actor_id, comment_id, type)')
  })

  it('has an incremental actor-id ambiguity fix without schema or RLS changes', () => {
    const fix = readFileSync(
      'supabase/migrations/20260818_fix_threaded_comment_actor_id_ambiguity.sql',
      'utf8',
    )
    expect(fix).toContain('create or replace function public.create_threaded_comment')
    expect(fix).toContain('v_actor_id uuid := auth.uid()')
    expect(fix).not.toMatch(/\n\s*actor_id uuid := auth\.uid\(\)/)
    expect(fix).toContain("set search_path = ''")
    expect(fix).toContain('security definer')
    expect(fix).toContain('on conflict (user_id, actor_id, comment_id, type)')
    expect(fix).not.toMatch(/alter table|create table|create index|create policy|drop policy/i)
  })

  it('uses the authoritative root-comment RPC in the single post flow', () => {
    const page = readFileSync('app/post/[id]/page.tsx', 'utf8')
    const createStart = page.indexOf('async function handleCreateComment')
    const createEnd = page.indexOf('async function handleCopyLink', createStart)
    const createFlow = page.slice(createStart, createEnd)

    expect(createFlow).toContain(".rpc('create_threaded_comment'")
    expect(createFlow).toContain('p_parent_comment_id: null')
    expect(createFlow).toContain('p_client_request_id: crypto.randomUUID()')
    expect(createFlow).not.toContain(".from('comments')")
    expect(createFlow).not.toContain(".from('notifications')")
    expect(page).toContain('<ThreadedComments')
  })

  it('synchronizes a newly created feed root with the threaded list', () => {
    const feed = readFileSync('app/feed/page.tsx', 'utf8')
    const createStart = feed.indexOf('async function handleCreateComment')
    const createEnd = feed.indexOf('async function handleToggleLike', createStart)
    const createFlow = feed.slice(createStart, createEnd)

    expect(createFlow).toContain(".rpc('create_threaded_comment'")
    expect(createFlow).toContain(".select('id, post_id, user_id, content, expression, created_at')")
    expect(createFlow).toContain('p_parent_comment_id: null')
    expect(createFlow).toContain('p_client_request_id: crypto.randomUUID()')
    expect(createFlow).not.toContain(".from('notifications')")
    expect(feed).toContain('threadedCommentsRefreshByPostId')
    expect(feed).toContain('refreshVersion={threadedCommentsRefreshByPostId[post.id] || 0}')
  })

  it('loads profiles separately and keeps ERROR mutually exclusive with EMPTY', () => {
    const component = readFileSync('app/components/ThreadedComments.tsx', 'utf8')
    expect(component).toContain(".from('comments').select(SELECT)")
    expect(component).toContain(".from('profiles')")
    expect(component).not.toMatch(/const SELECT = .*profiles\(/)
    expect(component).toContain("viewState === 'SUCCESS_EMPTY'")
    expect(component).toContain("viewState === 'LOADING'")
    expect(component).toContain("t('common.retry')")
    expect(component).toContain('const hasVisibleRoots = roots.length > 0')
    expect(component).toContain('append ? mergeComments(current, page) : page')
  })

  it('applies rate limiting and grants only callable RPCs', () => {
    expect(sql).toContain("created_at > now() - interval '1 minute'")
    expect(sql).toContain('if recent_count >= 12')
    expect(sql).toContain('revoke all on function public.validate_comment_tree() from public')
    expect(sql).toContain('grant execute on function public.create_threaded_comment')
  })

  it('uses hardened security-definer search paths and minimum grants', () => {
    expect(sql).not.toContain('set search_path = public')
    expect(sql.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(6)
    expect(sql).toContain('revoke all on function public.report_threaded_comment')
    expect(sql).toContain('grant execute on function public.report_threaded_comment')
    expect(sql).not.toMatch(/grant execute on function public\.(create|edit|delete|report)_threaded_comment[\s\S]*to (public|anon)/i)
  })

  it('stores validated minimal report context without expression payloads', () => {
    expect(sql).toContain('reported_comment_id uuid null')
    expect(sql).toContain('reported_parent_comment_id uuid null')
    expect(sql).toContain('reported_comment_author_id uuid null')
    expect(sql).toContain('reported_comment_depth smallint null')
    expect(sql).toContain('reported_expression_kind text null')
    expect(sql).toContain('reports_reporter_comment_once_idx')
    expect(sql).toContain('comment_report_rate_limited')
    expect(sql).toContain('length(normalized_reason) not between 10 and 500')
    expect(sql).not.toContain('reported_expression_payload')
    expect(sql).not.toContain('reported_comment_content')
  })

  it('preserves existing RLS rather than adding public grants', () => {
    expect(sql).not.toContain('disable row level security')
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+public\.comments\s+to\s+(anon|public)/i)
  })
})
