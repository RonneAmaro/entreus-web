import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CREATOR_CONTENT_PAGE_SIZE,
  buildCreatorChecklist,
  decodeCreatorCursor,
  encodeCreatorCursor,
  parseCreatorPeriod,
  sanitizeCreatorSearch,
  sumIntegerAmounts,
} from '@/lib/creator/creator-studio'

const route = readFileSync('app/api/creator-studio/overview/route.ts', 'utf8')
const page = readFileSync('app/creator-studio/page.tsx', 'utf8')
const shell = readFileSync('app/components/creator/CreatorStudioShell.tsx', 'utf8')
const ptBR = readFileSync('lib/i18n/catalogs/pt-BR.ts', 'utf8')
const en = readFileSync('lib/i18n/catalogs/en.ts', 'utf8')

const localizedKeys = [
  'creator.studio.content.empty',
  'creator.studio.shell.skipToContent',
  'creator.studio.shell.brand',
  'creator.studio.shell.title',
  'creator.studio.shell.createPost',
  'creator.studio.shell.backToFeed',
  'creator.studio.shell.navLabel',
  'creator.studio.shell.nav.overview',
  'creator.studio.shell.nav.content',
  'creator.studio.shell.nav.interactions',
  'creator.studio.shell.nav.insights',
  'creator.studio.shell.nav.earnings',
  'creator.studio.shell.nav.profile',
  'creator.studio.shell.nav.settings',
  'creator.studio.overview.greeting',
  'creator.studio.overview.description',
  'creator.studio.overview.checklistTitle',
  'creator.studio.overview.metrics.posts',
  'creator.studio.overview.metrics.viewsPeriod',
  'creator.studio.overview.metrics.likes',
  'creator.studio.overview.metrics.comments',
  'creator.studio.overview.metrics.followers',
  'creator.studio.overview.quickActions.title',
  'creator.studio.overview.quickActions.createPost',
  'creator.studio.overview.quickActions.viewPublicProfile',
  'creator.studio.overview.quickActions.manageContent',
  'creator.studio.overview.quickActions.checkEarnings',
  'creator.studio.interactions.title',
  'creator.studio.interactions.description',
  'creator.studio.interactions.empty',
  'creator.studio.insights.title',
  'creator.studio.insights.description',
  'creator.studio.insights.periodDays',
  'creator.studio.insights.summaryTitle',
  'creator.studio.insights.summary',
  'creator.studio.earnings.title',
  'creator.studio.earnings.description',
  'creator.studio.earnings.availableBalance',
  'creator.studio.earnings.pendingWithdrawals',
  'creator.studio.earnings.tipsReceived',
  'creator.studio.earnings.paidPostsReceived',
  'creator.studio.earnings.openWallet',
  'creator.studio.earnings.withdrawalRequests',
  'creator.studio.profile.title',
  'creator.studio.profile.description',
  'creator.studio.profile.emptyBio',
  'creator.studio.profile.viewProfile',
  'creator.studio.profile.editProfile',
  'creator.studio.settings.title',
  'creator.studio.settings.description',
  'creator.studio.settings.privacySecurity',
  'creator.studio.settings.profileIdentity',
  'creator.studio.settings.notifications',
  'creator.studio.settings.wallet',
] as const

describe('Creator Studio model', () => {
  it.each([7, 30, 90])('accepts the supported period %i', (period) => expect(parseCreatorPeriod(String(period))).toBe(period))
  it.each(['0', '14', '365', 'invalid', null])('rejects unsupported period %s', (period) => expect(parseCreatorPeriod(period)).toBeNull())

  it('round-trips the stable content cursor', () => {
    const encoded = encodeCreatorCursor('2026-07-17T10:00:00.000Z', '00000000-0000-4000-8000-000000000053')
    expect(decodeCreatorCursor(encoded)).toEqual({ createdAt: '2026-07-17T10:00:00.000Z', id: '00000000-0000-4000-8000-000000000053' })
  })
  it.each(['', 'bad', Buffer.from('{}').toString('base64url')])('rejects invalid cursor %s', (cursor) => expect(decodeCreatorCursor(cursor)).toBeNull())
  it('uses bounded content pages', () => expect(CREATOR_CONTENT_PAGE_SIZE).toBe(12))
  it('sanitizes search text and limits its length', () => {
    expect(sanitizeCreatorSearch('\u0000  conteúdo  ')).toBe('conteúdo')
    expect(sanitizeCreatorSearch('x'.repeat(100))).toHaveLength(80)
  })
  it('keeps financial values in integer ItaCash precision', () => {
    expect(sumIntegerAmounts([{ amount: 10 }, { amount: 20 }, { amount: 1.5 }, { amount: '99' }])).toBe(30)
  })
  it('derives onboarding from real profile and content state', () => {
    const checklist = buildCreatorChecklist({ avatarUrl: null, displayName: 'Ana', username: 'ana', bio: '', postCount: 0 })
    expect(checklist.find(({ id }) => id === 'identity')?.complete).toBe(true)
    expect(checklist.find(({ id }) => id === 'avatar')?.complete).toBe(false)
    expect(checklist.find(({ id }) => id === 'first-post')?.complete).toBe(false)
  })
  it('does not accept client progress in the checklist contract', () => {
    expect(buildCreatorChecklist({ postCount: 0 })).not.toHaveProperty('progress')
  })
})

describe('Creator Studio server boundary', () => {
  it('derives the creator from authenticated user and never accepts creator_id', () => {
    expect(route).toContain('supabase.auth.getUser()')
    expect(route).toContain(".eq('user_id', user.id)")
    expect(route).not.toMatch(/searchParams\.get\(['"]creator_id/)
  })
  it('rejects unauthenticated access and invalid filters', () => {
    expect(route).toContain("'not_authenticated' }, 401")
    expect(route).toContain("'invalid_period' }, 400")
    expect(route).toContain("'invalid_cursor' }, 400")
  })
  it('keeps authenticated responses out of public caches', () => {
    expect(route).toContain("'Cache-Control': 'private, no-store, max-age=0'")
    expect(route).not.toContain('force-static')
  })
  it('queries only the authenticated creator content and financial records', () => {
    expect(route.match(/\.eq\('user_id', user\.id\)/g)?.length).toBeGreaterThanOrEqual(5)
    expect(route).toContain(".eq('creator_id', user.id)")
  })
  it('limits comments and supports missing Package 51/52 columns', () => {
    expect(route).toContain(".from('comments').select('post_id')")
    expect(route).not.toContain('parent_comment_id')
    expect(route).not.toContain('expression')
  })
  it('returns partial errors instead of fabricating missing metrics', () => {
    expect(route).toContain('partialErrors')
    expect(route).toContain('followersResult.error ? null')
    expect(route).toContain('walletResult.error ? null')
    expect(route).toContain('viewsResult.error ? null')
  })
  it('does not expose administrative or banking payloads', () => {
    expect(route).not.toContain('payment_details')
    expect(route).not.toContain('admin_notes')
    expect(route).not.toContain('service_role')
  })
})

describe('Creator Studio page localization boundary', () => {
  it('removes the main visible hardcodes from the localized sections', () => {
    expect(page).not.toContain('Sua atividade real no EntreUS')
    expect(page).not.toContain('Checklist do criador')
    expect(page).not.toContain('Coment')
    expect(page).not.toContain('Visualiza')
    expect(page).not.toContain('Saldo dispon')
    expect(page).not.toContain('Biografia ainda n')
    expect(page).not.toContain('Atalhos para fontes de verdade')
    expect(shell).not.toContain('Pular para o conte')
    expect(shell).not.toContain('Criar publica')
    expect(shell).not.toContain('Voltar ao Feed')
    expect(shell).not.toContain('Seções do Creator Studio')
  })

  it('keeps the authenticated gate redirects and avoids window.location.assign', () => {
    expect(page).toContain("router.replace('/login')")
    expect(page).toContain("router.replace('/complete-profile')")
    expect(page).toContain("router.replace('/account-pending')")
    expect(page).not.toContain('window.location.assign')
  })

  it('uses the current app language instead of a fixed locale', () => {
    expect(page).toContain('formatDateTime(language, post.createdAt)')
    expect(page).toContain('formatNumber(language, overview.metrics.views)')
    expect(page).toContain('formatNumber(language, post.likes)')
    expect(page).not.toContain('pt-BR')
    expect(page).not.toContain('en-US')
    expect(page).not.toContain('toLocaleString(')
  })

  it('keeps user-facing errors sanitized and accessible', () => {
    expect(page).toContain("setError(t('creator.studio.errors.load'))")
    expect(page).not.toContain('error.message')
    expect(page).toContain('aria-live="assertive"')
    expect(page).toContain('aria-live="polite"')
  })

  it('defines the same new creator studio keys in both catalogs', () => {
    for (const key of localizedKeys) {
      expect(ptBR).toContain(`'${key}':`)
      expect(en).toContain(`'${key}':`)
    }
  })
})
