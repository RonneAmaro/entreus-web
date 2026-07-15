import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({ cleanup: vi.fn(), assertConfig: vi.fn(), rpc: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('../../lib/profile-media-orphan-cleanup', () => ({
  assertProfileMediaOrphanCleanupConfiguration: mocks.assertConfig,
  runProfileMediaOrphanCleanup: mocks.cleanup,
}))
import { runProfileMediaOrphanDryRunCron } from '../../lib/profile-media-orphan-cron'

describe('profile media orphan dry-run cron executor', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-role'
    mocks.cleanup.mockReset().mockResolvedValue({ claimed: 2, wouldDelete: 1, notFound: 0, protected: 1, failedValidation: 0, retried: 0, failed: 0 })
    mocks.assertConfig.mockReset()
    mocks.rpc.mockReset().mockImplementation((name: string) => name.startsWith('start_')
      ? Promise.resolve({ data: [{ run_id: 'run-1', status: 'started' }], error: null })
      : Promise.resolve({ data: true, error: null }))
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  it('locks first, uses a generated job id, fixed batch 10 and dry run, then records counters', async () => {
    const outcome = await runProfileMediaOrphanDryRunCron()
    expect(mocks.rpc.mock.calls[0][0]).toBe('start_profile_media_cleanup_run')
    expect(mocks.cleanup).toHaveBeenCalledWith({ batchSize: 10, jobId: expect.any(String), dryRun: true })
    expect(mocks.rpc.mock.calls[1]).toEqual(['complete_profile_media_cleanup_run', expect.objectContaining({ requested_status: 'succeeded', requested_claimed_count: 2, requested_would_delete_count: 1, requested_duration_ms: expect.any(Number) })])
    expect(outcome).toMatchObject({ status: 'succeeded', result: { claimed: 2, wouldDelete: 1 } })
  })

  it('does not clean when another run is active or start fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ run_id: null, status: 'already_running' }], error: null })
    expect(await runProfileMediaOrphanDryRunCron()).toEqual({ status: 'already_running' })
    expect(mocks.cleanup).not.toHaveBeenCalled()
    mocks.rpc.mockReset().mockResolvedValueOnce({ data: null, error: {} })
    await expect(runProfileMediaOrphanDryRunCron()).rejects.toThrow('database_start_failed')
    expect(mocks.cleanup).not.toHaveBeenCalled()
  })

  it('records sanitized configuration and cleanup failures', async () => {
    mocks.assertConfig.mockImplementationOnce(() => { throw new Error('secret internal configuration') })
    await expect(runProfileMediaOrphanDryRunCron()).rejects.toThrow('configuration_unavailable')
    expect(mocks.rpc).toHaveBeenLastCalledWith('complete_profile_media_cleanup_run', expect.objectContaining({ requested_status: 'configuration_error', requested_error_code: 'configuration_unavailable' }))
  })

  it('does not expose a cleanup failure payload in audit data or logs', async () => {
    mocks.cleanup.mockRejectedValueOnce(new Error('storage_key=https://private.example/secret'))
    await expect(runProfileMediaOrphanDryRunCron()).rejects.toThrow('cleanup_failed')
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'complete_profile_media_cleanup_run',
      expect.objectContaining({ requested_status: 'failed', requested_error_code: 'cleanup_failed' }),
    )
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(/storage_key|https?:|secret/i)
  })

  it('does not repeat cleanup when completion fails', async () => {
    mocks.rpc.mockImplementationOnce(() => Promise.resolve({ data: [{ run_id: 'run-1', status: 'started' }], error: null }))
      .mockImplementationOnce(() => Promise.resolve({ data: false, error: {} }))
    await expect(runProfileMediaOrphanDryRunCron()).rejects.toThrow('database_complete_failed')
    expect(mocks.cleanup).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('contains no destructive imports, switches or externally configurable limit', () => {
    const source = readFileSync('lib/profile-media-orphan-cron.ts', 'utf8')
    expect(source).not.toMatch(/DeleteObjectCommand|deleteApprovedProfileMediaObject|dryRun:\s*false|--execute/)
    expect(source).toContain('export async function runProfileMediaOrphanDryRunCron()')
  })
})
