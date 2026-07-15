import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertProfileMediaOrphanCleanupConfiguration, runProfileMediaOrphanCleanup } from '@/lib/profile-media-orphan-cleanup'

const BATCH_SIZE = 10
const STALE_TIMEOUT_MINUTES = 30

export type ProfileMediaOrphanCronResult =
  | { status: 'already_running' }
  | { status: 'succeeded'; result: { claimed: number; wouldDelete: number; notFound: number; protected: number; failedValidation: number; retried: number; failed: number; durationMs: number } }

export function verifyVercelCronAuthorization(authorization: string | null, expected = process.env.CRON_SECRET): boolean {
  if (!expected || expected.length < 32 || !authorization || !/^Bearer [^\s,]+$/.test(authorization)) return false
  const received = authorization.slice(7)
  const left = createHash('sha256').update(received).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function log(event: string, fields: Record<string, string | number>) {
  console.info('[profile-media-orphan-cron]', { event, ...fields })
}

async function complete(admin: SupabaseClient, values: Record<string, string | number | null>) {
  const { data, error } = await admin.rpc('complete_profile_media_cleanup_run', values)
  if (error || data !== true) throw new Error('database_complete_failed')
}

export async function runProfileMediaOrphanDryRunCron(): Promise<ProfileMediaOrphanCronResult> {
  const jobId = randomUUID()
  const admin = getAdminClient()
  if (!admin) {
    log('failed', { jobId, status: 'configuration_error', errorCode: 'configuration_unavailable' })
    throw new Error('configuration_unavailable')
  }

  const { data: started, error: startError } = await admin.rpc('start_profile_media_cleanup_run', {
    requested_job_id: jobId,
    requested_stale_timeout_minutes: STALE_TIMEOUT_MINUTES,
  })
  if (startError) {
    log('failed', { jobId, status: 'failed', errorCode: 'database_start_failed' })
    throw new Error('database_start_failed')
  }
  const start = Array.isArray(started) ? started[0] : started
  if (start?.status === 'already_running') {
    log('skipped', { jobId, status: 'already_running' })
    return { status: 'already_running' }
  }
  if (start?.status !== 'started' || typeof start.run_id !== 'string') {
    log('failed', { jobId, status: 'failed', errorCode: 'database_start_failed' })
    throw new Error('database_start_failed')
  }

  const runId = start.run_id
  const beganAt = Date.now()
  log('started', { jobId, runId, status: 'started' })
  let summary: Awaited<ReturnType<typeof runProfileMediaOrphanCleanup>>
  try {
    assertProfileMediaOrphanCleanupConfiguration()
    summary = await runProfileMediaOrphanCleanup({ batchSize: BATCH_SIZE, jobId, dryRun: true })
  } catch (caught) {
    const configuration = caught instanceof Error && /configuration|configured|unavailable/i.test(caught.message)
    const errorCode = configuration ? 'configuration_unavailable' : 'cleanup_failed'
    const status = configuration ? 'configuration_error' : 'failed'
    const durationMs = Math.max(0, Date.now() - beganAt)
    try {
      await complete(admin, {
        requested_run_id: runId, requested_job_id: jobId, requested_status: status,
        requested_claimed_count: 0, requested_would_delete_count: 0, requested_not_found_count: 0,
        requested_protected_count: 0, requested_failed_validation_count: 0, requested_retry_count: 0,
        requested_failed_count: 0, requested_duration_ms: durationMs, requested_error_code: errorCode,
      })
    } catch {
      log('failed', { jobId, runId, status: 'failed', durationMs, errorCode: 'database_complete_failed' })
      throw new Error('database_complete_failed')
    }
    log('failed', { jobId, runId, status, durationMs, errorCode })
    throw new Error(errorCode)
  }

  const durationMs = Math.max(0, Date.now() - beganAt)
  try {
    await complete(admin, {
      requested_run_id: runId, requested_job_id: jobId, requested_status: 'succeeded',
      requested_claimed_count: summary.claimed, requested_would_delete_count: summary.wouldDelete,
      requested_not_found_count: summary.notFound, requested_protected_count: summary.protected,
      requested_failed_validation_count: summary.failedValidation, requested_retry_count: summary.retried,
      requested_failed_count: summary.failed, requested_duration_ms: durationMs, requested_error_code: null,
    })
  } catch {
    log('failed', { jobId, runId, status: 'failed', durationMs, errorCode: 'database_complete_failed' })
    throw new Error('database_complete_failed')
  }
  const result = { claimed: summary.claimed, wouldDelete: summary.wouldDelete, notFound: summary.notFound, protected: summary.protected, failedValidation: summary.failedValidation, retried: summary.retried, failed: summary.failed, durationMs }
  log('completed', { jobId, runId, status: 'succeeded', ...result })
  return { status: 'succeeded', result }
}
