import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExpressionProviderError, searchExpressions } from '@/lib/expressions/expression-provider'

afterEach(() => { vi.unstubAllGlobals(); delete process.env.EXPRESSIONS_ENABLED; delete process.env.EXPRESSIONS_PROVIDER; delete process.env.EXPRESSIONS_API_KEY })

describe('server-side expression provider', () => {
  it('fails closed when disabled while Unicode remains independent', async () => { await expect(searchExpressions({ kind: 'gif', query: '', limit: 12, cursor: 0 })).rejects.toMatchObject({ code: 'disabled' }) })
  it('requires a server key', async () => { process.env.EXPRESSIONS_ENABLED = 'true'; process.env.EXPRESSIONS_PROVIDER = 'tenor'; await expect(searchExpressions({ kind: 'gif', query: '', limit: 12, cursor: 0 })).rejects.toMatchObject({ code: 'configuration' }) })
  it('uses safe filtering and sanitizes malformed/external results', async () => {
    process.env.EXPRESSIONS_ENABLED = 'true'; process.env.EXPRESSIONS_PROVIDER = 'tenor'; process.env.EXPRESSIONS_API_KEY = 'server-only'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ id: 'ok1', title: 'Festa', content_description: 'Festa segura', media_formats: { tinywebp: { url: 'https://media.tenor.com/a/preview.webp', dims: [120, 90] }, mp4: { url: 'https://media.tenor.com/a/media.mp4', dims: [320, 240] } } }, { id: 'bad', media_formats: { tinywebp: { url: 'https://evil.example/a.webp' }, mp4: { url: 'https://evil.example/a.mp4' } } }], next: '12', api_key: 'leak' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await searchExpressions({ kind: 'gif', query: 'festa', limit: 12, cursor: 0 })
    expect(result.items).toHaveLength(1); expect(JSON.stringify(result)).not.toContain('server-only'); expect(JSON.stringify(result)).not.toContain('leak')
    const called = new URL(fetchMock.mock.calls[0][0]); expect(called.searchParams.get('contentfilter')).toBe('high'); expect(called.searchParams.get('key')).toBe('server-only')
  })
  it('maps quota and timeout without logging user searches', async () => {
    process.env.EXPRESSIONS_ENABLED = 'true'; process.env.EXPRESSIONS_PROVIDER = 'tenor'; process.env.EXPRESSIONS_API_KEY = 'key'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    await expect(searchExpressions({ kind: 'sticker', query: 'private words', limit: 2, cursor: 0 })).rejects.toEqual(expect.objectContaining<Partial<ExpressionProviderError>>({ code: 'quota' }))
  })
})
