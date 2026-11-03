import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Package 08.4 likes Realtime and public liker details', () => {
  const realtimeMigration = read('supabase/migrations/20260910100000_enable_likes_realtime.sql')
  const visibilityMigration = read('supabase/migrations/20260910100500_harden_like_visibility_for_liker_details.sql')
  const hook = read('lib/use-likes-realtime.ts')
  const details = read('app/components/LikerDetails.tsx')
  const actions = read('app/components/PostActions.tsx')

  it('adds only likes to the Realtime publication idempotently and without destructive SQL', () => {
    expect(realtimeMigration).toContain("pubname = 'supabase_realtime'")
    expect(realtimeMigration).toContain("tablename = 'likes'")
    expect(realtimeMigration).toContain('alter publication supabase_realtime add table public.likes')
    expect(realtimeMigration).not.toMatch(/drop publication|delete from|truncate|db reset/i)
  })

  it('enforces bidirectional blocks in the likes RLS policy before profiles are requested', () => {
    expect(visibilityMigration).toContain('drop policy if exists "Adult-safe like select" on public.likes')
    expect(visibilityMigration).toContain('from public.blocks b')
    expect(visibilityMigration).toContain('b.blocked_id = likes.user_id')
    expect(visibilityMigration).toContain('likes.user_id and b.blocked_id = auth.uid()')
  })

  it('uses the shared debounced subscription helper and refetches authoritative likes', () => {
    expect(hook).toContain("table: 'likes'")
    expect(hook).toContain('createSocialRealtimeSubscription')
    expect(hook).toContain('refreshRef.current()')
  })

  it('keeps profiles lazy and limits the preview/list queries to public fields', () => {
    expect(details).toContain(".select('id, display_name, username, avatar_url')")
    expect(details).toContain('LIKER_PREVIEW_LIMIT')
    expect(details).toContain('LIKER_DETAILS_LIMIT')
    expect(details).not.toMatch(/birth_date|email|phone|document|financial/i)
  })

  it('keeps the heart action separate from the accessible likes-count details control', () => {
    expect(actions).toContain('onClick={onLike}')
    expect(actions).toContain('onClick={onLikesDetails}')
    expect(actions).toContain('onMouseEnter={onLikesPreview}')
    expect(actions).toContain('aria-expanded={likesDetailsOpen}')
  })

  it('covers every social card surface with the shared Realtime invalidation hook', () => {
    for (const path of ['app/feed/page.tsx', 'app/post/[id]/page.tsx', 'app/saved/page.tsx', 'app/u/[username]/page.tsx']) {
      const page = read(path)
      expect(page).toContain('useLikesRealtimeRefresh')
      expect(page).toContain('likerIds=')
    }
  })
})
