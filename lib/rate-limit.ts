import { NextResponse } from 'next/server'

// Central rate limiting primitives for Route Handlers.
// This keeps the current in-memory Map approach used by the project today,
// while exposing an async store contract so endpoints can later switch to
// Redis/Upstash without changing their limiter call sites.
// Memory storage remains best-effort only and is not a global limit across
// multiple serverless instances.

export type RateLimitState = {
  count: number
  resetAt: number
}

export type RateLimitHeadersMode = 'none' | 'standard'

export type RateLimitCheckOptions = {
  key: string
  now?: number
}

export type RateLimitOptions = {
  limit: number
  windowMs: number
  headers?: RateLimitHeadersMode
  store?: RateLimitStore
}

export type RateLimitSuccess = {
  ok: true
  key: string
  limit: number
  remaining: number
  resetAt: number
  retryAfterSeconds: number
  headers: Record<string, string>
}

export type RateLimitFailure = {
  ok: false
  key: string
  limit: number
  remaining: 0
  resetAt: number
  retryAfterSeconds: number
  headers: Record<string, string>
}

export type RateLimitResult = RateLimitSuccess | RateLimitFailure

export interface RateLimitStore {
  get(key: string): Promise<RateLimitState | undefined> | RateLimitState | undefined
  set(key: string, value: RateLimitState): Promise<void> | void
  delete?(key: string): Promise<void> | void
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly store = new Map<string, RateLimitState>()

  async get(key: string) {
    return this.store.get(key)
  }

  async set(key: string, value: RateLimitState) {
    this.store.set(key, value)
  }

  async delete(key: string) {
    this.store.delete(key)
  }
}

function toRetryAfterSeconds(resetAt: number, now: number) {
  return Math.max(1, Math.ceil((resetAt - now) / 1000))
}

function toUnixSeconds(timestampMs: number) {
  return Math.floor(timestampMs / 1000)
}

function buildResultHeaders(
  limit: number,
  remaining: number,
  resetAt: number,
  retryAfterSeconds: number,
  mode: RateLimitHeadersMode,
): Record<string, string> {
  if (mode === 'none') return {}

  return {
    'Retry-After': String(retryAfterSeconds),
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(toUnixSeconds(resetAt)),
  }
}

export function createRateLimitHeaders(
  result: Pick<RateLimitResult, 'limit' | 'remaining' | 'resetAt' | 'retryAfterSeconds'>,
  mode: RateLimitHeadersMode = 'standard',
): Record<string, string> {
  return buildResultHeaders(
    result.limit,
    result.remaining,
    result.resetAt,
    result.retryAfterSeconds,
    mode,
  )
}

export function createRateLimiter({
  limit,
  windowMs,
  headers = 'standard',
  store = new MemoryRateLimitStore(),
}: RateLimitOptions) {
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('Rate limit must be a positive number.')
  }

  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('Rate limit window must be a positive number of milliseconds.')
  }

  return {
    async check({ key, now = Date.now() }: RateLimitCheckOptions): Promise<RateLimitResult> {
      if (!key.trim()) {
        throw new Error('Rate limit key is required.')
      }

      const current = await store.get(key)

      if (current && current.resetAt <= now) {
        await store.delete?.(key)
      }

      if (!current || current.resetAt <= now) {
        const nextState = {
          count: 1,
          resetAt: now + windowMs,
        }
        const remaining = Math.max(0, limit - nextState.count)
        const retryAfterSeconds = toRetryAfterSeconds(nextState.resetAt, now)
        const result: RateLimitSuccess = {
          ok: true,
          key,
          limit,
          remaining,
          resetAt: nextState.resetAt,
          retryAfterSeconds,
          headers: buildResultHeaders(
            limit,
            remaining,
            nextState.resetAt,
            retryAfterSeconds,
            headers,
          ),
        }

        await store.set(key, nextState)
        return result
      }

      if (current.count >= limit) {
        const retryAfterSeconds = toRetryAfterSeconds(current.resetAt, now)
        return {
          ok: false,
          key,
          limit,
          remaining: 0,
          resetAt: current.resetAt,
          retryAfterSeconds,
          headers: buildResultHeaders(
            limit,
            0,
            current.resetAt,
            retryAfterSeconds,
            headers,
          ),
        }
      }

      const nextState = {
        count: current.count + 1,
        resetAt: current.resetAt,
      }
      await store.set(key, nextState)

      const remaining = Math.max(0, limit - nextState.count)
      const retryAfterSeconds = toRetryAfterSeconds(nextState.resetAt, now)
      return {
        ok: true,
        key,
        limit,
        remaining,
        resetAt: nextState.resetAt,
        retryAfterSeconds,
        headers: buildResultHeaders(
          limit,
          remaining,
          nextState.resetAt,
          retryAfterSeconds,
          headers,
        ),
      }
    },
  }
}

export type RateLimitExceededBody = {
  ok?: false
  error: string
  message?: string
}

export function createRateLimitExceededResponse(
  result: RateLimitFailure,
  body: RateLimitExceededBody = {
    ok: false,
    error: 'RATE_LIMITED',
    message: 'Too many requests.',
  },
) {
  return NextResponse.json(body, {
    status: 429,
    headers: result.headers,
  })
}
