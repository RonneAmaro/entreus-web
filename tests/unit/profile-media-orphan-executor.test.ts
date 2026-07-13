import { beforeEach, describe, expect, it, vi } from 'vitest'

const r2 = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  deleteObject: vi.fn(),
  headObject: vi.fn(),
}))

vi.mock('../../lib/profile-media-r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/profile-media-r2')>()
  return {
    ...actual,
    isProfileMediaR2Configured: r2.configured,
    deleteApprovedProfileMediaObject: r2.deleteObject,
    headApprovedProfileMediaObject: r2.headObject,
  }
})

import { runProfileMediaOrphanCleanup } from '../../lib/profile-media-orphan-cleanup'

type State = { orphans: Array<Record<string, unknown>>; profiles: Array<Record<string, unknown>>; approved: Array<Record<string, unknown>>; associated: Array<Record<string, unknown>>; completions: Array<Record<string, unknown>>; profileErrors: boolean[] }

function query(result: () => { data: Array<Record<string, unknown>>; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'or']) builder[method] = vi.fn(() => builder)
  builder.limit = vi.fn(async () => result())
  return builder
}

function adminFor(state: State) {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_profile_media_copy_orphans') return { data: state.orphans, error: null }
      if (name === 'complete_profile_media_copy_orphan') { state.completions.push(args); return { data: null, error: null } }
      throw new Error(`Unexpected RPC: ${name}`)
    }),
    from: vi.fn((table: string) => {
      if (table === 'profiles') return query(() => ({ data: state.profiles, error: state.profileErrors.shift() ? { message: 'validation failed' } : null }))
      if (table === 'profile_media_submissions') {
        let call = 0
        return query(() => ({ data: call++ === 0 ? state.approved : state.associated, error: null }))
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function baseState(attemptCount = 1): State {
  return { orphans: [{ id: 'orphan-1', submission_id: null, storage_key: 'profile-media/public/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg', attempt_count: attemptCount }], profiles: [], approved: [], associated: [], completions: [], profileErrors: [] }
}

describe('profile media orphan cleanup executor', () => {
  beforeEach(() => {
    process.env.R2_PUBLIC_BASE_URL = 'https://media.example.test'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
    r2.configured.mockReturnValue(true)
    r2.deleteObject.mockReset().mockResolvedValue('deleted')
    r2.headObject.mockReset().mockResolvedValue('exists')
  })

  it('dry run validates but does not delete or consume the queue', async () => {
    const state = baseState(); const admin = adminFor(state)
    await expect(runProfileMediaOrphanCleanup({ jobId: 'dry-job', dryRun: true, adminClient: admin as never })).resolves.toEqual({ claimed: 1, deleted: 0, notFound: 0, protected: 0, retried: 0, failed: 0, wouldDelete: 1, failedValidation: 0 })
    expect(r2.headObject).toHaveBeenCalledTimes(1)
    expect(r2.deleteObject).not.toHaveBeenCalled()
    expect(state.completions).toHaveLength(0)
    expect(admin.rpc).toHaveBeenCalledWith('claim_profile_media_copy_orphans', expect.objectContaining({ requested_dry_run: true }))
  })

  it('confirms deletion and finalizes the claimed row without returning a key', async () => {
    const state = baseState(); const admin = adminFor(state)
    const result = await runProfileMediaOrphanCleanup({ jobId: 'real-job', dryRun: false, adminClient: admin as never })
    expect(result).toEqual({ claimed: 1, deleted: 1, notFound: 0, protected: 0, retried: 0, failed: 0, wouldDelete: 0, failedValidation: 0 })
    expect(state.completions[0]).toMatchObject({ requested_orphan_id: 'orphan-1', requested_status: 'deleted' })
    expect(r2.headObject).toHaveBeenCalledTimes(1)
    expect(r2.deleteObject).toHaveBeenCalledTimes(1)
    const profileChecks = vi.mocked(admin.from).mock.invocationCallOrder.filter((_, index) => vi.mocked(admin.from).mock.calls[index][0] === 'profiles')
    expect(profileChecks).toHaveLength(2)
    expect(profileChecks[1]).toBeLessThan(r2.deleteObject.mock.invocationCallOrder[0])
    expect(JSON.stringify(result)).not.toContain('storage_key')
  })

  it('marks a currently approved object protected and never deletes it', async () => {
    const state = baseState(); state.approved = [{ id: 'submission-approved' }]
    const result = await runProfileMediaOrphanCleanup({ jobId: 'protect-job', dryRun: false, adminClient: adminFor(state) as never })
    expect(result.protected).toBe(1)
    expect(r2.deleteObject).not.toHaveBeenCalled()
    expect(state.completions[0]).toMatchObject({ requested_status: 'protected' })
  })

  it('protects an object used by the current avatar or banner URL', async () => {
    const state = baseState(); state.profiles = [{ id: 'user-a', avatar_url: 'https://media.example.test/profile-media/public/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg', banner_url: null }]
    const result = await runProfileMediaOrphanCleanup({ jobId: 'profile-job', dryRun: false, adminClient: adminFor(state) as never })
    expect(result.protected).toBe(1)
    expect(r2.deleteObject).not.toHaveBeenCalled()
  })

  it('clamps batch size before calling the database claim', async () => {
    const state = baseState(); const admin = adminFor(state)
    await runProfileMediaOrphanCleanup({ jobId: 'bounded-job', batchSize: 500, dryRun: true, adminClient: admin as never })
    expect(admin.rpc).toHaveBeenCalledWith('claim_profile_media_copy_orphans', expect.objectContaining({ requested_limit: 50 }))
  })

  it('revalidates database use after HEAD and does not delete when the second validation fails', async () => {
    const state = baseState(); state.profileErrors = [false, true]
    const admin = adminFor(state)
    const result = await runProfileMediaOrphanCleanup({ jobId: 'race-job', dryRun: false, adminClient: admin as never })
    expect(result.retried).toBe(1)
    expect(r2.headObject).toHaveBeenCalledTimes(1)
    expect(r2.deleteObject).not.toHaveBeenCalled()
    expect(admin.from).toHaveBeenCalledWith('profiles')
  })

  it('marks an absent object not_found', async () => {
    r2.headObject.mockResolvedValue('not_found')
    const state = baseState(); const result = await runProfileMediaOrphanCleanup({ jobId: 'missing-job', dryRun: false, adminClient: adminFor(state) as never })
    expect(result.notFound).toBe(1)
    expect(r2.deleteObject).not.toHaveBeenCalled()
    expect(state.completions[0]).toMatchObject({ requested_status: 'not_found' })
  })

  it('schedules retry after a temporary failure and fails at the attempt limit', async () => {
    r2.deleteObject.mockRejectedValue(new Error('temporary'))
    const retryState = baseState(1); const retry = await runProfileMediaOrphanCleanup({ jobId: 'retry-job', dryRun: false, adminClient: adminFor(retryState) as never })
    expect(retry.retried).toBe(1)
    expect(retryState.completions[0]).toMatchObject({ requested_status: 'retry', requested_error_code: 'r2_temporary_failure' })
    expect(retryState.completions[0].requested_next_attempt_at).toEqual(expect.any(String))
    const failedState = baseState(5); const failed = await runProfileMediaOrphanCleanup({ jobId: 'failed-job', dryRun: false, adminClient: adminFor(failedState) as never })
    expect(failed.failed).toBe(1)
    expect(failedState.completions[0]).toMatchObject({ requested_status: 'failed' })
  })

  it('stops before claiming when R2 configuration is absent', async () => {
    r2.configured.mockReturnValue(false)
    const state = baseState(); const admin = adminFor(state)
    await expect(runProfileMediaOrphanCleanup({ jobId: 'config-job', dryRun: false, adminClient: admin as never })).rejects.toThrow('configuration')
    expect(admin.rpc).not.toHaveBeenCalled()
    expect(r2.deleteObject).not.toHaveBeenCalled()
  })

  it('rejects unsafe public URL configuration before claim or R2 access', async () => {
    for (const url of ['http://media.example.test', 'https://user:pass@media.example.test', 'https://media.example.test?x=1', 'https://media.example.test#x']) {
      process.env.R2_PUBLIC_BASE_URL = url
      const state = baseState(); const admin = adminFor(state)
      await expect(runProfileMediaOrphanCleanup({ jobId: 'unsafe-config-job', dryRun: false, adminClient: admin as never })).rejects.toThrow('configuration')
      expect(admin.rpc).not.toHaveBeenCalled()
      expect(r2.headObject).not.toHaveBeenCalled()
      expect(r2.deleteObject).not.toHaveBeenCalled()
    }
  })
})
