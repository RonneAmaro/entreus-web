import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { CookieMethodsServer } from '@supabase/ssr'

const state = vi.hoisted(() => ({ user: null as { id: string } | null, error: null as { status: number } | null, rotate: false }))
vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: CookieMethodsServer }) => ({
    auth: { getUser: async () => {
      if (state.rotate) await options.cookies.setAll?.([{ name: 'test-session-cookie', value: 'fixture-cookie', options: { path: '/', maxAge: 34560000 } }], { 'Pragma': 'no-cache' })
      return { data: { user: state.user }, error: state.error }
    } },
  }),
}))
import { proxy } from '@/proxy'

describe('composed request proxy', () => {
  beforeEach(() => { state.user = null; state.error = null; state.rotate = false })
  it.each(['entreus.com.br', 'entreus.vercel.app', 'entreus-web.vercel.app'])('canonicalizes %s before authentication', async (host) => {
    state.error = { status: 503 }
    const result = await proxy(new NextRequest('http://localhost:3000/settings?tab=privacy', { headers: { host } }))
    expect(result.headers.get('location')).toBe('https://www.entreus.com.br/settings?tab=privacy')
  })
  it.each(['www.entreus.com.br', 'entreus-random-ronneamaros-projects.vercel.app'])('does not canonicalize %s', async (host) => {
    const result = await proxy(new NextRequest(`https://${host}/`, { headers: { host } }))
    expect(result.headers.get('location')).toBeNull()
  })
  it('rejects a guest protected route and preserves the internal return path', async () => {
    const result = await proxy(new NextRequest('https://preview.example/messages/123?tab=chat'))
    expect(result.headers.get('location')).toBe('https://preview.example/login?next=%2Fmessages%2F123%3Ftab%3Dchat')
  })
  it('a file extension cannot bypass a protected dynamic route', async () => {
    const result = await proxy(new NextRequest('https://preview.example/messages/example.json'))
    expect(result.status).toBe(307)
    expect(result.headers.get('location')).toContain('/login?next=')
  })
  it('propagates refreshed cookies to request and response', async () => {
    state.user = { id: 'user' }; state.rotate = true
    const request = new NextRequest('https://preview.example/feed')
    const result = await proxy(request)
    expect(request.cookies.has('test-session-cookie')).toBe(true)
    expect(result.cookies.has('test-session-cookie')).toBe(true)
    expect(result.headers.get('location')).toBeNull()
    expect(result.headers.get('cache-control')).toContain('no-store')
    expect(result.headers.get('pragma')).toBe('no-cache')
  })
  it('redirects without discarding cookie updates', async () => {
    state.rotate = true
    const result = await proxy(new NextRequest('https://preview.example/feed'))
    expect(result.cookies.has('test-session-cookie')).toBe(true)
    expect(result.headers.get('location')).toContain('/login')
  })
  it('temporary outage does not redirect to login or delete existing cookies', async () => {
    state.error = { status: 503 }
    const result = await proxy(new NextRequest('https://preview.example/feed'))
    expect(result.status).toBe(503)
    expect(result.headers.get('location')).toBeNull()
    expect(result.cookies.getAll().length).toBe(0)
  })
  it('retains a completed refresh even when subsequent validation is unavailable', async () => {
    state.rotate = true; state.error = { status: 503 }
    const result = await proxy(new NextRequest('https://preview.example/feed'))
    expect(result.status).toBe(503)
    expect(result.cookies.has('test-session-cookie')).toBe(true)
  })
})
