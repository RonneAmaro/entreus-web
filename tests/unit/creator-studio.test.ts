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
