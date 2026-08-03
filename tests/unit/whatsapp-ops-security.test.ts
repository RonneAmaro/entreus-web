import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type RouteModule = {
  GET?: (request: Request) => Promise<Response>
  POST?: (request: Request) => Promise<Response>
}

const ORIGINAL_ENV = { ...process.env }

function setOperationalEnv() {
  process.env.WHATSAPP_ACCESS_TOKEN = 'token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-number-id'
  process.env.WHATSAPP_API_VERSION = 'v20.0'
  process.env.WHATSAPP_TEST_TO = '5566999999999'
  process.env.WHATSAPP_TEST_SECRET = 'top-secret'
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = 'waba-id'
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value
  }
}

function createAuthorizedRequest(
  url: string,
  options: {
    method?: 'GET' | 'POST'
    ip?: string
    body?: unknown
    secret?: string
  } = {},
) {
  const headers = new Headers()
  headers.set('x-forwarded-for', options.ip || '198.51.100.10')

  if (options.secret !== undefined) {
    headers.set('Authorization', `Bearer ${options.secret}`)
  }

  let body: string | undefined
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }

  return new Request(url, {
    method: options.method || 'POST',
    headers,
    body,
  })
}

async function loadTestSendRoute() {
  const route = (await import('@/app/api/whatsapp/test-send/route')) as RouteModule
  return route
}

async function loadSubscribedAppsRoute() {
  const route = (await import('@/app/api/whatsapp/subscribed-apps/route')) as RouteModule
  return route
}

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  restoreEnv()
  setOperationalEnv()
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
  restoreEnv()
})

describe('whatsapp operational route hardening', () => {
  it('does not accept the secret in query string anymore', async () => {
    const route = await loadTestSendRoute()
    const request = new Request(
      'https://example.com/api/whatsapp/test-send?secret=top-secret',
      {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.10' },
      },
    )

    const response = await route.POST!(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('UNAUTHORIZED')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects a missing authorization header', async () => {
    const route = await loadSubscribedAppsRoute()
    const request = new Request('https://example.com/api/whatsapp/subscribed-apps', {
      method: 'GET',
      headers: { 'x-forwarded-for': '198.51.100.10' },
    })

    const response = await route.GET!(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('UNAUTHORIZED')
    expect(String(body.message)).not.toContain('top-secret')
  })

  it('rejects an invalid authorization header', async () => {
    const route = await loadSubscribedAppsRoute()
    const request = createAuthorizedRequest(
      'https://example.com/api/whatsapp/subscribed-apps',
      { method: 'GET', secret: 'wrong-secret' },
    )

    const response = await route.GET!(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('UNAUTHORIZED')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('allows a valid header to proceed', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'msg-1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const route = await loadTestSendRoute()
    const request = createAuthorizedRequest('https://example.com/api/whatsapp/test-send', {
      body: { message: 'ping' },
      secret: 'top-secret',
    })

    const response = await route.POST!(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not throw on secrets with different lengths', async () => {
    const route = await loadSubscribedAppsRoute()
    const request = createAuthorizedRequest(
      'https://example.com/api/whatsapp/subscribed-apps',
      { method: 'GET', secret: 'x' },
    )

    await expect(route.GET!(request)).resolves.toBeInstanceOf(Response)
    const response = await route.GET!(request)
    expect(response.status).toBe(401)
  })

  it('fails safely when an env var is missing', async () => {
    delete process.env.WHATSAPP_TEST_SECRET

    const route = await loadSubscribedAppsRoute()
    const request = createAuthorizedRequest(
      'https://example.com/api/whatsapp/subscribed-apps',
      { method: 'GET', secret: 'top-secret' },
    )

    const response = await route.GET!(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toBe('MISSING_ENV_VARS')
    expect(body.missing).toBeUndefined()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('blocks test-send after the configured limit', async () => {
    vi.mocked(global.fetch).mockImplementation(async () =>
      new Response(JSON.stringify({ messaging_product: 'whatsapp' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const route = await loadTestSendRoute()

    for (let index = 0; index < 5; index += 1) {
      const response = await route.POST!(
        createAuthorizedRequest('https://example.com/api/whatsapp/test-send', {
          secret: 'top-secret',
          ip: '203.0.113.10',
          body: { message: `msg-${index}` },
        }),
      )
      expect(response.status).toBe(200)
    }

    const blocked = await route.POST!(
      createAuthorizedRequest('https://example.com/api/whatsapp/test-send', {
        secret: 'top-secret',
        ip: '203.0.113.10',
        body: { message: 'blocked' },
      }),
    )

    expect(blocked.status).toBe(429)
    expect(global.fetch).toHaveBeenCalledTimes(5)
  })

  it('counts unauthorized test-send attempts toward the rate limit', async () => {
    const route = await loadTestSendRoute()

    for (let index = 0; index < 5; index += 1) {
      const response = await route.POST!(
        createAuthorizedRequest('https://example.com/api/whatsapp/test-send', {
          secret: 'wrong-secret',
          ip: '203.0.113.20',
        }),
      )
      expect(response.status).toBe(401)
    }

    const blocked = await route.POST!(
      createAuthorizedRequest('https://example.com/api/whatsapp/test-send', {
        secret: 'wrong-secret',
        ip: '203.0.113.20',
      }),
    )

    expect(blocked.status).toBe(429)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('blocks subscribed-apps GET after the configured limit', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const route = await loadSubscribedAppsRoute()

    for (let index = 0; index < 10; index += 1) {
      const response = await route.GET!(
        createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
          method: 'GET',
          secret: 'top-secret',
          ip: '203.0.113.11',
        }),
      )
      expect(response.status).toBe(200)
    }

    const blocked = await route.GET!(
      createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
        method: 'GET',
        secret: 'top-secret',
        ip: '203.0.113.11',
      }),
    )

    expect(blocked.status).toBe(429)
    expect(global.fetch).toHaveBeenCalledTimes(10)
  })

  it('counts unauthorized subscribed-apps GET attempts toward the rate limit', async () => {
    const route = await loadSubscribedAppsRoute()

    for (let index = 0; index < 10; index += 1) {
      const response = await route.GET!(
        createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
          method: 'GET',
          secret: 'wrong-secret',
          ip: '203.0.113.21',
        }),
      )
      expect(response.status).toBe(401)
    }

    const blocked = await route.GET!(
      createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
        method: 'GET',
        secret: 'wrong-secret',
        ip: '203.0.113.21',
      }),
    )

    expect(blocked.status).toBe(429)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('blocks subscribed-apps POST after the configured limit', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const route = await loadSubscribedAppsRoute()

    for (let index = 0; index < 5; index += 1) {
      const response = await route.POST!(
        createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
          method: 'POST',
          secret: 'top-secret',
          ip: '203.0.113.12',
        }),
      )
      expect(response.status).toBe(200)
    }

    const blocked = await route.POST!(
      createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
        method: 'POST',
        secret: 'top-secret',
        ip: '203.0.113.12',
      }),
    )

    expect(blocked.status).toBe(429)
    expect(global.fetch).toHaveBeenCalledTimes(5)
  })

  it('counts unauthorized subscribed-apps POST attempts toward the rate limit', async () => {
    const route = await loadSubscribedAppsRoute()

    for (let index = 0; index < 5; index += 1) {
      const response = await route.POST!(
        createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
          method: 'POST',
          secret: 'wrong-secret',
          ip: '203.0.113.22',
        }),
      )
      expect(response.status).toBe(401)
    }

    const blocked = await route.POST!(
      createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
        method: 'POST',
        secret: 'wrong-secret',
        ip: '203.0.113.22',
      }),
    )

    expect(blocked.status).toBe(429)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns the expected 429 rate limit headers', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const route = await loadSubscribedAppsRoute()

    for (let index = 0; index < 10; index += 1) {
      await route.GET!(
        createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
          method: 'GET',
          secret: 'top-secret',
          ip: '203.0.113.13',
        }),
      )
    }

    const blocked = await route.GET!(
      createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
        method: 'GET',
        secret: 'top-secret',
        ip: '203.0.113.13',
      }),
    )

    expect(blocked.headers.get('Retry-After')).toBeTruthy()
    expect(blocked.headers.get('X-RateLimit-Limit')).toBe('10')
    expect(blocked.headers.get('X-RateLimit-Remaining')).toBe('0')
    expect(blocked.headers.get('X-RateLimit-Reset')).toBeTruthy()
  })

  it('keeps GET and POST buckets independent', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const route = await loadSubscribedAppsRoute()

    for (let index = 0; index < 5; index += 1) {
      const postResponse = await route.POST!(
        createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
          method: 'POST',
          secret: 'top-secret',
          ip: '203.0.113.14',
        }),
      )
      expect(postResponse.status).toBe(200)
    }

    const blockedPost = await route.POST!(
      createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
        method: 'POST',
        secret: 'top-secret',
        ip: '203.0.113.14',
      }),
    )
    const allowedGet = await route.GET!(
      createAuthorizedRequest('https://example.com/api/whatsapp/subscribed-apps', {
        method: 'GET',
        secret: 'top-secret',
        ip: '203.0.113.14',
      }),
    )

    expect(blockedPost.status).toBe(429)
    expect(allowedGet.status).toBe(200)
  })

  it('does not leak secrets in error bodies', async () => {
    const route = await loadTestSendRoute()
    const response = await route.POST!(
      createAuthorizedRequest('https://example.com/api/whatsapp/test-send', {
        secret: 'wrong-secret',
        body: { message: 'ping' },
      }),
    )
    const body = await response.json()
    const serialized = JSON.stringify(body)

    expect(serialized).not.toContain('wrong-secret')
    expect(serialized).not.toContain('top-secret')
  })
})
