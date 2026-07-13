import { beforeEach, describe, expect, it, vi } from 'vitest'

const cleanup = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../../lib/profile-media-orphan-cleanup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/profile-media-orphan-cleanup')>()
  return { ...actual, runProfileMediaOrphanCleanup: cleanup.run }
})

import { POST } from '../../app/api/internal/profile-media-orphan-cleanup/route'

const secret = 's'.repeat(32)
function request(receivedSecret?: string, body: object = {}) {
  return new Request('http://localhost/api/internal/profile-media-orphan-cleanup', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(receivedSecret ? { 'x-profile-media-cleanup-secret': receivedSecret } : {}) },
    body: JSON.stringify(body),
  })
}

describe('internal profile media orphan cleanup route', () => {
  beforeEach(() => {
    process.env.PROFILE_MEDIA_CLEANUP_SECRET = secret
    cleanup.run.mockReset().mockResolvedValue({ claimed: 2, deleted: 1, notFound: 0, protected: 1, retried: 0, failed: 0, wouldDelete: 0, failedValidation: 0 })
  })

  it('rejects missing and incorrect dedicated secrets', async () => {
    expect((await POST(request())).status).toBe(401)
    expect((await POST(request('wrong'))).status).toBe(401)
    expect(cleanup.run).not.toHaveBeenCalled()
  })

  it('runs dry by default, bounds input in the executor and returns only counters', async () => {
    const response = await POST(request(secret, { limit: 500 }))
    expect(response.status).toBe(200)
    expect(cleanup.run).toHaveBeenCalledWith(expect.objectContaining({ batchSize: 500, dryRun: true }))
    const payload = await response.json()
    expect(payload).toMatchObject({ ok: true, dryRun: true, result: { claimed: 2, deleted: 1 } })
    expect(JSON.stringify(payload)).not.toMatch(/storage_key|bucket|secret|token/i)
    expect(response.headers.get('cache-control')).toContain('private, no-store')
  })

  it('requires an explicit false dryRun value for destructive execution', async () => {
    await POST(request(secret, { limit: 3, dryRun: false }))
    expect(cleanup.run).toHaveBeenCalledWith(expect.objectContaining({ batchSize: 3, dryRun: false }))
  })

  it('sanitizes executor failures', async () => {
    cleanup.run.mockRejectedValue(new Error('sensitive internal detail'))
    const response = await POST(request(secret, { dryRun: false }))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('sensitive internal detail')
  })
})
