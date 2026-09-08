import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../..')
const read = (relative: string) => readFileSync(path.join(repoRoot, relative), 'utf8')

const commentsMigration = read('supabase/migrations/20260908150744_beta_rc1_hardening.sql')
const notificationsMigration = read('supabase/migrations/20260908160042_social_notification_hardening.sql')
const commentsComponent = read('app/components/ThreadedComments.tsx')
const agePage = read('app/age-verification/page.tsx')
const socialClientSources = [
  'app/feed/page.tsx',
  'app/post/[id]/page.tsx',
  'app/saved/page.tsx',
  'app/u/[username]/page.tsx',
].map(read).join('\n')

describe('blocked comment visibility hardening', () => {
  it('keeps adult-content protection and adds bidirectional block filtering to SELECT', () => {
    expect(commentsMigration).toContain('public.can_view_post_for_rls(')
    expect(commentsMigration).toContain('b.blocker_id = auth.uid() and b.blocked_id = comments.user_id')
    expect(commentsMigration).toContain('b.blocker_id = comments.user_id and b.blocked_id = auth.uid()')
  })

  it('refilters roots and replies through the same server-backed block lookup', () => {
    expect(commentsComponent).toContain("supabase.from('blocks').select('blocked_id')")
    expect(commentsComponent).toContain("supabase.from('blocks').select('blocker_id')")
    expect((commentsComponent.match(/filterBlockedComments\(/g) || [])).toHaveLength(2)
  })
})

describe('authoritative social notifications', () => {
  it('derives actors and recipients in a trigger instead of trusting browser payloads', () => {
    expect(notificationsMigration).toContain('v_actor_id is distinct from auth.uid()')
    expect(notificationsMigration).toContain('select p.user_id into v_recipient_id')
    expect(notificationsMigration).toContain('v_recipient_id := new.following_id')
    expect(notificationsMigration).toContain('likes_notify_authoritatively')
    expect(notificationsMigration).toContain('reposts_notify_authoritatively')
    expect(notificationsMigration).toContain('follows_notify_authoritatively')
  })

  it('blocks self/blocked notifications and deduplicates social events', () => {
    expect(notificationsMigration).toContain('v_recipient_id = v_actor_id')
    expect(notificationsMigration).toContain('from public.blocks b')
    expect(notificationsMigration).toContain('notifications_social_dedup_key_once_idx')
    expect(notificationsMigration).toContain('on conflict (social_dedup_key)')
  })

  it('denies direct social notification inserts and removes them from social clients', () => {
    expect(notificationsMigration).toContain("type not in ('like', 'repost', 'follow', 'comment')")
    expect(socialClientSources).not.toMatch(/from\(['"]notifications['"]\)\.insert/)
  })
})

describe('safe beta error feedback', () => {
  it('shows comment report loading, success and safe failure states', () => {
    expect(commentsComponent).toContain("t('post.comments.reporting')")
    expect(commentsComponent).toContain("t('post.comments.reportSuccess')")
    expect(commentsComponent).toContain("t('post.comments.reportError')")
    expect(commentsComponent).not.toContain('setReportError(error.message)')
  })

  it('separates age create, storage and finalize failures without raw backend messages', () => {
    expect(agePage).toContain('Nao foi possivel iniciar a solicitacao. Tente novamente.')
    expect(agePage).toContain('Nao foi possivel enviar os arquivos. Tente novamente.')
    expect(agePage).toContain('Nao foi possivel concluir o envio. Tente novamente.')
    expect(agePage).not.toContain('Nao foi possivel enviar os documentos: ')
  })
})
