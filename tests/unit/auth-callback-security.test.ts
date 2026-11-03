import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const exchange = vi.hoisted(() => vi.fn())
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { exchangeCodeForSession: exchange } }) }))
import { GET } from '@/app/auth/callback/route'

describe('PKCE callback routing', () => {
  beforeEach(() => { exchange.mockReset(); exchange.mockResolvedValue({ error: null }) })
  it('exchanges code and removes it from destination', async () => {
    const response = await GET(new NextRequest('https://preview.example/auth/callback?code=fixture-code&next=/feed'))
    expect(exchange).toHaveBeenCalledWith('fixture-code')
    expect(response.headers.get('location')).toBe('https://preview.example/auth/finish?next=%2Ffeed')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
  it('rejects external destinations', async () => {
    const response = await GET(new NextRequest('https://preview.example/auth/callback?code=fixture-code&next=https://evil.example'))
    expect(response.headers.get('location')).toBe('https://preview.example/auth/finish?next=%2Ffeed')
  })
  it('recovery goes to the internal reset flow', async () => {
    const response = await GET(new NextRequest('https://preview.example/auth/callback?code=fixture-code&type=recovery'))
    expect(response.headers.get('location')).toBe('https://preview.example/reset-password?flow=recovery')
  })
  it('missing code never attempts exchange', async () => {
    const response = await GET(new NextRequest('https://preview.example/auth/callback'))
    expect(exchange).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('https://preview.example/login?error=callback_failed')
  })
  it('failed exchange never forwards private error details', async () => {
    exchange.mockResolvedValue({ error: new Error('private upstream detail') })
    const response = await GET(new NextRequest('https://preview.example/auth/callback?code=fixture-code'))
    expect(response.headers.get('location')).toBe('https://preview.example/login?error=callback_failed')
  })
})
