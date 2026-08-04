import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: state.createClient }))

function creatorBody(email = 'creator@example.com') {
  return { name: 'Ana', email, category: 'Vídeos', message: 'Quero participar.', acknowledged: true }
}

function creatorRequest(ip: string, email = 'creator@example.com', body = creatorBody(email)) {
  return new Request('http://localhost/api/creator-interest', {
    method: 'POST', headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

function consentRequest(ip: string, email = 'guardian@example.com', body = { guardian_email: email, guardian_name: 'Maria' }) {
  return new Request('http://localhost/api/parental-consent/send-email', {
    method: 'POST', headers: { authorization: 'Bearer bearer-secret', 'x-forwarded-for': ip, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

function setupSupabase() {
  state.insert.mockReturnValue({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'request-1', child_user_id: 'user-a', guardian_email: 'guardian@example.com', token: 'token', status: 'pending', child_birth_date: '2010-01-01', expires_at: new Date(Date.now() + 100000).toISOString(), created_at: new Date().toISOString() }, error: null })) })) })
  state.update.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) })
  state.from.mockImplementation((table: string) => table === 'profiles'
    ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: 'user-a', birth_date: '2010-01-01', is_minor: true, parental_consent_status: 'pending' }, error: null })) })) })), update: state.update }
    : { insert: state.insert })
  state.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null })
  state.createClient.mockReturnValue({ from: state.from, auth: { getUser: state.getUser } })
  state.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'email-1' }), { status: 200 }))
  global.fetch = state.fetch
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  process.env.RESEND_API_KEY = 'resend-secret'
  process.env.EMAIL_FROM = 'EntreUS <noreply@example.com>'
}

function dbTotals() {
  return {
    from: state.from.mock.calls.length,
    profiles: state.from.mock.calls.filter(([table]) => table === 'profiles').length,
    insert: state.insert.mock.calls.length,
    update: state.update.mock.calls.length,
    fetch: state.fetch.mock.calls.length,
  }
}

async function creatorRoute() { return await import('@/app/api/creator-interest/route') }
async function consentRoute() { return await import('@/app/api/parental-consent/send-email/route') }

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); setupSupabase()
})

describe('creator interest intake rate limits', () => {
  it('keeps valid submissions working', async () => {
    const route = await creatorRoute(); const response = await route.POST(creatorRequest('198.51.100.1'))
    expect(response.status).toBe(200); expect(state.from).toHaveBeenCalledWith('creator_interest_requests')
  })

  it('blocks the 11th IP request before parsing or Supabase', async () => {
    const route = await creatorRoute()
    for (let i = 0; i < 10; i += 1) await route.POST(creatorRequest('198.51.100.2', `a${i}@example.com`))
    const blocked = await route.POST(new Request('http://localhost/api/creator-interest', { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.2' }, body: '{' }))
    expect(blocked.status).toBe(429); expect(state.createClient).toHaveBeenCalledTimes(10); expect(state.from).toHaveBeenCalledTimes(10)
  })

  it('limits normalized email independently of IP', async () => {
    const route = await creatorRoute()
    for (let i = 0; i < 3; i += 1) expect((await route.POST(creatorRequest(`198.51.100.${10 + i}`, i === 0 ? '  Test@Example.com ' : 'test@example.com'))).status).toBe(200)
    const blocked = await route.POST(creatorRequest('198.51.100.13', 'TEST@example.com'))
    expect(blocked.status).toBe(429); expect(state.createClient).toHaveBeenCalledTimes(3)
    expect((await route.POST(creatorRequest('198.51.100.14', 'other@example.com'))).status).toBe(200)
  })

  it('returns complete safe 429 headers and body', async () => {
    const route = await creatorRoute()
    for (let i = 0; i < 3; i += 1) await route.POST(creatorRequest(`198.51.100.${20 + i}`))
    const response = await route.POST(creatorRequest('198.51.100.23'))
    const body = JSON.stringify(await response.json())
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBeTruthy(); expect(response.headers.get('X-RateLimit-Limit')).toBe('3'); expect(response.headers.get('X-RateLimit-Remaining')).toBe('0'); expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy()
    expect(JSON.parse(body).error).toBe('RATE_LIMITED'); expect(body).not.toContain('creator@example.com'); expect(body).not.toContain(createHash('sha256').update('creator@example.com').digest('hex')); expect(body).not.toContain('198.51.100.23'); expect(body).not.toContain('creator-interest-email')
  })
})

describe('parental consent email rate limits', () => {
  it('keeps the valid flow and Resend call working', async () => {
    const route = await consentRoute(); const response = await route.POST(consentRequest('203.0.113.1'))
    expect(response.status).toBe(200); expect((await response.json()).success).toBe(true); expect(state.getUser).toHaveBeenCalledTimes(1); expect(state.from).toHaveBeenCalledWith('profiles'); expect(state.insert).toHaveBeenCalledTimes(1); expect(state.update).toHaveBeenCalledTimes(1); expect(state.fetch).toHaveBeenCalledTimes(1)
  })

  it('blocks the 11th IP request before Supabase authentication', async () => {
    const route = await consentRoute()
    for (let i = 0; i < 10; i += 1) {
      state.getUser.mockResolvedValue({ data: { user: { id: `user-ip-${i}` } }, error: null })
      await route.POST(consentRequest('203.0.113.2', `g${i}@example.com`))
    }
    const totals = dbTotals()
    const blocked = await route.POST(consentRequest('203.0.113.2'))
    expect(blocked.status).toBe(429); expect(state.createClient).toHaveBeenCalledTimes(10); expect(state.getUser).toHaveBeenCalledTimes(10); expect(dbTotals()).toEqual(totals)
  })

  it('blocks the 6th request per user while allowing another user', async () => {
    const route = await consentRoute()
    for (let i = 0; i < 5; i += 1) expect((await route.POST(consentRequest(`203.0.113.${10 + i}`, `g${i}@example.com`))).status).toBe(200)
    const totals = dbTotals()
    expect((await route.POST(consentRequest('203.0.113.16', 'g5@example.com'))).status).toBe(429); expect(dbTotals()).toEqual(totals)
    state.getUser.mockResolvedValue({ data: { user: { id: 'user-b' } }, error: null })
    expect((await route.POST(consentRequest('203.0.113.17', 'new@example.com'))).status).toBe(200)
  })

  it('blocks the 4th same user and guardian with normalized email', async () => {
    const route = await consentRoute()
    for (let i = 0; i < 3; i += 1) expect((await route.POST(consentRequest(`203.0.113.${30 + i}`, i === 0 ? ' Guardian@Example.com ' : 'guardian@example.com'))).status).toBe(200)
    const totals = dbTotals()
    const blocked = await route.POST(consentRequest('203.0.113.33', 'GUARDIAN@example.com'))
    expect(blocked.status).toBe(429); expect(dbTotals()).toEqual(totals)
    expect((await route.POST(consentRequest('203.0.113.34', 'other@example.com'))).status).toBe(200)
    state.getUser.mockResolvedValue({ data: { user: { id: 'user-b' } }, error: null })
    expect((await route.POST(consentRequest('203.0.113.35', 'guardian@example.com'))).status).toBe(200)
  })

  it('returns safe standardized 429 body and headers', async () => {
    const route = await consentRoute()
    for (let i = 0; i < 3; i += 1) await route.POST(consentRequest(`203.0.113.${40 + i}`))
    const response = await route.POST(consentRequest('203.0.113.43'))
    const body = JSON.stringify(await response.json())
    expect(response.status).toBe(429); expect(response.headers.get('Retry-After')).toBeTruthy(); expect(response.headers.get('X-RateLimit-Limit')).toBe('3'); expect(response.headers.get('X-RateLimit-Remaining')).toBe('0'); expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy(); const parsed = JSON.parse(body); expect(parsed.success).toBe(false); expect(parsed.error).toBe('RATE_LIMITED'); expect(typeof parsed.message).toBe('string'); expect(body).not.toContain('bearer-secret'); expect(body).not.toContain('guardian@example.com'); expect(body).not.toContain('user-a'); expect(body).not.toContain('approval_url'); expect(body).not.toContain('token_hash'); expect(body).not.toContain('resend-secret'); expect(body).not.toContain('RESEND_API_KEY'); expect(body).not.toContain('EMAIL_FROM'); expect(body).not.toContain('anon-key'); expect(body).not.toContain('SUPABASE'); expect(body).not.toContain('parental-consent-email-user'); expect(body).not.toContain('parental-consent-email-guardian'); expect(body).not.toContain(createHash('sha256').update('guardian@example.com').digest('hex')); expect(body).not.toContain('203.0.113.43'); expect(state.fetch).toHaveBeenCalledTimes(3)
  })
})
