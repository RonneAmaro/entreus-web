import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'
import {
  buildApprovedProfileMediaUrl,
  deleteApprovedProfileMediaObject,
  headApprovedProfileMediaObject,
  isProfileMediaR2Configured,
  parseApprovedProfileMediaKey,
} from '@/lib/profile-media-r2'

const DEFAULT_RETENTION_HOURS = 24
const DEFAULT_CLAIM_TIMEOUT_MINUTES = 30
const MAX_BATCH_SIZE = 50
const MAX_ATTEMPTS = 5
const BACKOFF_MINUTES = [15, 60, 360, 1440] as const

type ClaimedOrphan = { id: string; submission_id: string | null; storage_key: string; attempt_count: number }
type CleanupStatus = 'deleted' | 'not_found' | 'protected' | 'retry' | 'failed'
type CleanupSummary = { claimed: number; deleted: number; notFound: number; protected: number; retried: number; failed: number; wouldDelete: number; failedValidation: number }

export function getProfileMediaOrphanRetentionHours(value = process.env.PROFILE_MEDIA_ORPHAN_RETENTION_HOURS) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 720 ? parsed : DEFAULT_RETENTION_HOURS
}

export function getProfileMediaOrphanBackoffMinutes(attemptCount: number) {
  return attemptCount >= MAX_ATTEMPTS ? null : BACKOFF_MINUTES[Math.max(0, Math.min(attemptCount - 1, BACKOFF_MINUTES.length - 1))]
}

export function extractApprovedProfileMediaKey(urlValue: unknown, publicBaseUrl = process.env.R2_PUBLIC_BASE_URL) {
  if (typeof urlValue !== 'string' || !publicBaseUrl) return null
  try {
    const base = new URL(publicBaseUrl); const value = new URL(urlValue)
    if (base.protocol !== 'https:' || value.protocol !== 'https:' || base.origin !== value.origin || value.search || value.hash) return null
    const basePath = base.pathname.replace(/\/+$/, '')
    if (basePath && !value.pathname.startsWith(`${basePath}/`)) return null
    const key = decodeURIComponent(value.pathname.slice(basePath.length).replace(/^\/+/, ''))
    return parseApprovedProfileMediaKey(key)?.key || null
  } catch { return null }
}

export function assertProfileMediaOrphanCleanupConfiguration() {
  if (!isProfileMediaR2Configured() || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Profile media cleanup configuration is unavailable.')
  }
  const rawBase = process.env.R2_PUBLIC_BASE_URL
  if (!rawBase || /[\u0000-\u001f\u007f]|\.\.|%[0-9a-f]{2}/i.test(rawBase)) throw new Error('Profile media cleanup configuration is unavailable.')
  try {
    const base = new URL(rawBase)
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || /\/{2,}/.test(base.pathname)) {
      throw new Error('invalid')
    }
  } catch { throw new Error('Profile media cleanup configuration is unavailable.') }
}

export function sanitizeProfileMediaCleanupError(error: unknown) {
  const value = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } } | null
  if (value?.name === 'AccessDenied' || value?.Code === 'AccessDenied' || value?.$metadata?.httpStatusCode === 403) return 'r2_access_denied'
  if (error instanceof Error && /configuration|configured|unavailable/i.test(error.message)) return 'configuration_unavailable'
  if (error instanceof Error && /metadata|key/i.test(error.message)) return 'unsafe_object'
  return 'r2_temporary_failure'
}

export function verifyProfileMediaCleanupSecret(received: string | null | undefined, expected = process.env.PROFILE_MEDIA_CLEANUP_SECRET) {
  if (!expected || expected.length < 32 || !received) return false
  const left = createHash('sha256').update(received).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function isOrphanInUse(admin: SupabaseClient, orphan: ClaimedOrphan) {
  const parsedKey = parseApprovedProfileMediaKey(orphan.storage_key)
  if (!parsedKey) return true
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL
  if (!publicBaseUrl) throw new Error('Public media configuration is unavailable.')
  const publicUrl = buildApprovedProfileMediaUrl(publicBaseUrl, parsedKey.userId, parsedKey.key)
  const [approved, associated, profiles] = await Promise.all([
    admin.from('profile_media_submissions').select('id').eq('approved_storage_key', orphan.storage_key).eq('status', 'approved').limit(1),
    orphan.submission_id
      ? admin.from('profile_media_submissions').select('id,status').eq('id', orphan.submission_id).in('status', ['pending_review', 'approved']).limit(1)
      : Promise.resolve({ data: [], error: null }),
    admin.from('profiles').select('id,avatar_url,banner_url').or(`avatar_url.eq.${publicUrl},banner_url.eq.${publicUrl}`).limit(2),
  ])
  if (approved.error || associated.error || profiles.error) throw new Error('Database safety validation failed.')
  if ((approved.data || []).length || (associated.data || []).length) return true
  return (profiles.data || []).some((profile) =>
    extractApprovedProfileMediaKey(profile.avatar_url, publicBaseUrl) === orphan.storage_key ||
    extractApprovedProfileMediaKey(profile.banner_url, publicBaseUrl) === orphan.storage_key)
}

async function finalize(admin: SupabaseClient, orphan: ClaimedOrphan, jobId: string, status: CleanupStatus, errorCode: string | null, nextAttemptAt: string | null) {
  const { error } = await admin.rpc('complete_profile_media_copy_orphan', {
    requested_orphan_id: orphan.id, requested_job_id: jobId, requested_status: status,
    requested_error_code: errorCode, requested_next_attempt_at: nextAttemptAt,
  })
  if (error) throw new Error('Could not finalize orphan cleanup state.')
}

export async function runProfileMediaOrphanCleanup({ batchSize = 10, jobId, dryRun = true, adminClient }: {
  batchSize?: number; jobId: string; dryRun?: boolean; adminClient?: SupabaseClient
}): Promise<CleanupSummary> {
  if (!jobId?.trim()) throw new Error('Cleanup job id is required.')
  assertProfileMediaOrphanCleanupConfiguration()
  const admin = adminClient || getAdminClient()
  if (!admin) throw new Error('Supabase cleanup configuration is unavailable.')
  const safeBatchSize = Math.min(Math.max(Math.trunc(batchSize) || 10, 1), MAX_BATCH_SIZE)
  const { data, error } = await admin.rpc('claim_profile_media_copy_orphans', {
    requested_limit: safeBatchSize, requested_job_id: jobId.trim().slice(0, 120),
    requested_retention_hours: getProfileMediaOrphanRetentionHours(), requested_claim_timeout_minutes: DEFAULT_CLAIM_TIMEOUT_MINUTES,
    requested_dry_run: dryRun,
  })
  if (error) throw new Error('Could not claim profile media orphans.')
  const orphans = (data || []) as ClaimedOrphan[]
  const summary: CleanupSummary = { claimed: orphans.length, deleted: 0, notFound: 0, protected: 0, retried: 0, failed: 0, wouldDelete: 0, failedValidation: 0 }

  for (const orphan of orphans) {
    let status: CleanupStatus; let errorCode: string | null = null; let nextAttemptAt: string | null = null
    try {
      if (!parseApprovedProfileMediaKey(orphan.storage_key)) {
        status = 'protected'
        if (dryRun) summary.failedValidation += 1
        else summary.protected += 1
      } else if (await isOrphanInUse(admin, orphan)) {
        status = 'protected'; summary.protected += 1
      } else if (dryRun) {
        const presence = await headApprovedProfileMediaObject(orphan.storage_key)
        if (presence === 'not_found') summary.notFound += 1
        else {
          if (await isOrphanInUse(admin, orphan)) summary.protected += 1
          else summary.wouldDelete += 1
        }
        continue
      } else {
        const presence = await headApprovedProfileMediaObject(orphan.storage_key)
        if (presence === 'not_found') {
          status = 'not_found'; summary.notFound += 1
        } else if (await isOrphanInUse(admin, orphan)) {
          status = 'protected'; summary.protected += 1
          await finalize(admin, orphan, jobId, status, null, null)
          continue
        } else {
          status = await deleteApprovedProfileMediaObject(orphan.storage_key)
          summary.deleted += 1
        }
      }
    } catch (caught) {
      errorCode = sanitizeProfileMediaCleanupError(caught)
      if (errorCode === 'configuration_unavailable') throw caught
      if (errorCode === 'unsafe_object') {
        status = 'protected'
        if (dryRun) summary.failedValidation += 1
        else summary.protected += 1
      }
      else {
        const delay = getProfileMediaOrphanBackoffMinutes(orphan.attempt_count)
        status = delay === null ? 'failed' : 'retry'
        if (delay === null) summary.failed += 1
        else { summary.retried += 1; nextAttemptAt = new Date(Date.now() + delay * 60_000).toISOString() }
      }
    }
    if (!dryRun) await finalize(admin, orphan, jobId, status, errorCode, nextAttemptAt)
  }
  return summary
}
