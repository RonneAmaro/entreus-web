import { beforeEach, describe, expect, it, vi } from 'vitest'

const cron = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../../lib/profile-media-orphan-cron', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/profile-media-orphan-cron')>()
  return { ...actual, runProfileMediaOrphanDryRunCron: cron.run }
})

import * as route from '../../app/api/internal/cron/profile-media-orphan-dry-run/route'
import { verifyVercelCronAuthorization } from '../../lib/profile-media-orphan-cron'

const secret = 'c'.repeat(32)
const request = (authorization?: string, suffix = '') => new Request(`http://localhost/api/internal/cron/profile-media-orphan-dry-run${suffix}`, {
  method: 'GET', headers: authorization ? { Authorization: authorization } : {},
})

describe('profile media orphan cron route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = secret
    cron.run.mockReset().mockResolvedValue({ status: 'succeeded', result: { claimed: 1, wouldDelete: 1, notFound: 0, protected: 0, failedValidation: 0, retried: 0, failed: 0, durationMs: 2 } })
  })

  it('strictly verifies a sufficiently long Bearer secret', () => {
    expect(verifyVercelCronAuthorization(null, secret)).toBe(false)
    expect(verifyVercelCronAuthorization(secret, secret)).toBe(false)
    expect(verifyVercelCronAuthorization(`Basic ${secret}`, secret)).toBe(false)
    expect(verifyVercelCronAuthorization(`Bearer  ${secret}`, secret)).toBe(false)
    expect(verifyVercelCronAuthorization(`Bearer ${secret}`, 'short')).toBe(false)
    expect(verifyVercelCronAuthorization(`Bearer ${secret}`, secret)).toBe(true)
  })

  it('rejects absent and incorrect authorization', async () => {
    expect((await route.GET(request())).status).toBe(401)
    expect((await route.GET(request('Bearer wrong'))).status).toBe(401)
    expect(cron.run).not.toHaveBeenCalled()
  })

  it('fails closed when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const response = await route.GET(request(`Bearer ${secret}`))
    expect(response.status).toBe(401)
    expect(cron.run).not.toHaveBeenCalled()
  })

  it('runs once, ignores query input and returns sanitized counters without caching', async () => {
    const response = await route.GET(request(`Bearer ${secret}`, '?dryRun=false&limit=999&storage_key=private'))
    expect(cron.run).toHaveBeenCalledTimes(1)
    expect(response.headers.get('cache-control')).toContain('private, no-store')
    const text = await response.text()
    expect(text).not.toMatch(/storage_key|bucket|https?:|secret|authorization/i)
    expect(JSON.parse(text)).toMatchObject({ ok: true, status: 'succeeded', result: { claimed: 1 } })
  })

  it('returns already_running and sanitizes failures', async () => {
    cron.run.mockResolvedValueOnce({ status: 'already_running' })
    expect(await (await route.GET(request(`Bearer ${secret}`))).json()).toEqual({ ok: true, status: 'already_running' })
    cron.run.mockRejectedValueOnce(new Error('storage_key=https://internal'))
    const response = await route.GET(request(`Bearer ${secret}`))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toMatch(/storage_key|https?:/i)
  })

  it('exports only GET as an HTTP method', () => {
    expect(route).toHaveProperty('GET')
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(route).not.toHaveProperty(method)
  })
})
