import { describe, expect, it } from 'vitest'
import {
  type RateLimitState,
  createRateLimiter,
  createRateLimitExceededResponse,
} from '@/lib/rate-limit'

describe('rate limit infrastructure', () => {
  it('validates invalid limit', () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 60_000 })).toThrow(
      'Rate limit must be a positive number.',
    )
  })

  it('validates invalid windowMs', () => {
    expect(() => createRateLimiter({ limit: 1, windowMs: 0 })).toThrow(
      'Rate limit window must be a positive number of milliseconds.',
    )
  })

  it('requires a non-empty key', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })

    await expect(limiter.check({ key: '   ', now: 1_000 })).rejects.toThrow(
      'Rate limit key is required.',
    )
  })

  it('allows calls until the limit and blocks the next one', async () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 })

    const first = await limiter.check({ key: 'user:a', now: 1_000 })
    const second = await limiter.check({ key: 'user:a', now: 2_000 })
    const third = await limiter.check({ key: 'user:a', now: 3_000 })
    const fourth = await limiter.check({ key: 'user:a', now: 4_000 })

    expect(first).toMatchObject({ ok: true, remaining: 2 })
    expect(second).toMatchObject({ ok: true, remaining: 1 })
    expect(third).toMatchObject({ ok: true, remaining: 0 })
    expect(fourth).toMatchObject({ ok: false, remaining: 0 })
  })

  it('releases a key after the window expires', async () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 })

    await limiter.check({ key: 'user:a', now: 1_000 })
    await limiter.check({ key: 'user:a', now: 2_000 })
    await limiter.check({ key: 'user:a', now: 3_000 })

    const nextWindow = await limiter.check({ key: 'user:a', now: 61_000 })

    expect(nextWindow).toMatchObject({ ok: true, remaining: 2, resetAt: 121_000 })
  })

  it('keeps buckets independent', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })

    const first = await limiter.check({ key: 'user:a', now: 1_000 })
    const second = await limiter.check({ key: 'user:b', now: 1_000 })
    const third = await limiter.check({ key: 'user:a', now: 2_000 })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(third.ok).toBe(false)
  })

  it('never returns negative remaining', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })

    await limiter.check({ key: 'user:a', now: 1_000 })
    const blocked = await limiter.check({ key: 'user:a', now: 1_500 })

    expect(blocked).toMatchObject({ ok: false, remaining: 0 })
  })

  it('rounds Retry-After up and keeps a minimum of 1 second', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_500 })

    const allowed = await limiter.check({ key: 'user:a', now: 1_000 })
    const blocked = await limiter.check({ key: 'user:a', now: 2_499 })

    expect(allowed.retryAfterSeconds).toBe(2)
    expect(blocked.retryAfterSeconds).toBe(1)
    expect(allowed.headers['Retry-After']).toBe('2')
    expect(blocked.headers['Retry-After']).toBe('1')
  })

  it('uses Unix seconds for X-RateLimit-Reset', async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 })

    const result = await limiter.check({ key: 'user:a', now: 1_000 })

    expect(result.headers['X-RateLimit-Reset']).toBe('61')
  })

  it("does not return headers when mode is 'none'", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, headers: 'none' })

    const result = await limiter.check({ key: 'user:a', now: 1_000 })

    expect(result.headers).toEqual({})
  })

  it('returns a 429 response with headers and custom body', async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })

    await limiter.check({ key: 'user:a', now: 1_000 })
    const blocked = await limiter.check({ key: 'user:a', now: 2_000 })

    expect(blocked.ok).toBe(false)
    if (blocked.ok) throw new Error('Expected a blocked result.')

    const response = createRateLimitExceededResponse(blocked, {
      ok: false,
      error: 'RATE_LIMITED',
      message: 'Custom message.',
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe(blocked.headers['Retry-After'])
  })

  it('supports a custom async store', async () => {
    const store = new Map<string, RateLimitState>()
    const asyncStore = {
      async get(key: string) {
        return store.get(key)
      },
      async set(key: string, value: RateLimitState) {
        store.set(key, value)
      },
      async delete(key: string) {
        store.delete(key)
      },
    }
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, store: asyncStore })

    const first = await limiter.check({ key: 'user:a', now: 1_000 })
    const second = await limiter.check({ key: 'user:a', now: 2_000 })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(store.get('user:a')).toEqual({ count: 2, resetAt: 61_000 })
  })

  it('removes expired state before starting a new window', async () => {
    const operations: string[] = []
    const store = new Map<string, RateLimitState>([
      ['user:a', { count: 9, resetAt: 5_000 }],
    ])
    const trackedStore = {
      async get(key: string) {
        operations.push(`get:${key}`)
        return store.get(key)
      },
      async set(key: string, value: RateLimitState) {
        operations.push(`set:${key}:${value.count}:${value.resetAt}`)
        store.set(key, value)
      },
      async delete(key: string) {
        operations.push(`delete:${key}`)
        store.delete(key)
      },
    }
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, store: trackedStore })

    const result = await limiter.check({ key: 'user:a', now: 5_000 })

    expect(result).toMatchObject({ ok: true, remaining: 2, resetAt: 65_000 })
    expect(store.get('user:a')).toEqual({ count: 1, resetAt: 65_000 })
    expect(operations).toEqual([
      'get:user:a',
      'delete:user:a',
      'set:user:a:1:65000',
    ])
  })
})
