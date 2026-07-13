import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  extractApprovedProfileMediaKey,
  getProfileMediaOrphanBackoffMinutes,
  getProfileMediaOrphanRetentionHours,
  sanitizeProfileMediaCleanupError,
  verifyProfileMediaCleanupSecret,
} from '../../lib/profile-media-orphan-cleanup'
import { isMissingR2ObjectError, isSafeApprovedProfileMediaKey, parseApprovedProfileMediaKey } from '../../lib/profile-media-r2'

const migration = readFileSync('supabase/migrations/20260712_harden_profile_media_orphan_cleanup.sql', 'utf8')

describe('profile media orphan cleanup policy', () => {
  const userId = '11111111-1111-4111-8111-111111111111'
  const objectId = '22222222-2222-4222-8222-222222222222'
  const key = `profile-media/public/${userId}/${objectId}.jpg`
  it('uses a safe retention fallback for invalid or dangerous values', () => {
    expect(getProfileMediaOrphanRetentionHours(undefined)).toBe(24)
    expect(getProfileMediaOrphanRetentionHours('0')).toBe(24)
    expect(getProfileMediaOrphanRetentionHours('-1')).toBe(24)
    expect(getProfileMediaOrphanRetentionHours('abc')).toBe(24)
    expect(getProfileMediaOrphanRetentionHours('48')).toBe(48)
  })

  it('calculates deterministic retry backoff and stops at five attempts', () => {
    expect([1, 2, 3, 4, 5].map(getProfileMediaOrphanBackoffMinutes)).toEqual([15, 60, 360, 1440, null])
  })

  it('accepts only relative approved public keys', () => {
    expect(parseApprovedProfileMediaKey(key)).toEqual({ userId, objectId, extension: 'jpg', key })
    for (const invalid of ['profile-media/public/user/file.jpg', `profile-media/public/${userId}/file.jpg`, `profile-media/public/${userId}/${objectId}.gif`, `${key}/extra`, key.replace('/', '%2f'), 'protected/profile-media/user/file.jpg', 'profile-media/public/../file.jpg', `profile-media/public/${userId}\\${objectId}.jpg`, `https://media.test/${key}`, `${key}?x=1`, `${key}#x`]) {
      expect(isSafeApprovedProfileMediaKey(invalid)).toBe(false)
    }
  })

  it('extracts keys only from the configured HTTPS public base', () => {
    const base = 'https://media.example.test/assets'
    expect(extractApprovedProfileMediaKey(`https://media.example.test/assets/${key}`, base)).toBe(key)
    expect(extractApprovedProfileMediaKey(`https://evil.test/assets/${key}`, base)).toBeNull()
    expect(extractApprovedProfileMediaKey('https://media.example.test/assets/profile-media/public/../secret', base)).toBeNull()
  })

  it('uses constant-time digest comparison and requires a strong configured secret', () => {
    const secret = 'a'.repeat(32)
    expect(verifyProfileMediaCleanupSecret(secret, secret)).toBe(true)
    expect(verifyProfileMediaCleanupSecret('wrong', secret)).toBe(false)
    expect(verifyProfileMediaCleanupSecret(secret, 'short')).toBe(false)
  })

  it('sanitizes operational error classes', () => {
    expect(sanitizeProfileMediaCleanupError(Object.assign(new Error(), { name: 'AccessDenied' }))).toBe('r2_access_denied')
    expect(sanitizeProfileMediaCleanupError(new Error('configuration unavailable'))).toBe('configuration_unavailable')
    expect(sanitizeProfileMediaCleanupError(new Error('temporary'))).toBe('r2_temporary_failure')
  })

  it('classifies only object-level missing errors as absence', () => {
    expect(isMissingR2ObjectError({ name: 'NoSuchKey' })).toBe(true)
    expect(isMissingR2ObjectError({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })).toBe(true)
    expect(isMissingR2ObjectError({ name: 'NotFound', Code: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } })).toBe(false)
    expect(isMissingR2ObjectError({ name: 'Unknown', $metadata: { httpStatusCode: 404 } })).toBe(false)
    expect(isMissingR2ObjectError({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })).toBe(false)
  })

  it('defines bounded service-role-only concurrent claims and stale recovery', () => {
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain("o.status in ('pending', 'retry')")
    expect(migration).toContain('safe_limit integer := least(greatest')
    expect(migration).toContain("storage_key ~ '^profile-media/public/[0-9a-f]{8}")
    expect(migration).toContain("last_error_code = 'stale_claim_recovered'")
    for (const role of ['public', 'anon', 'authenticated']) expect(migration).toContain(`from ${role};`)
    expect(migration).toContain('to service_role;')
  })

  it('enforces completion invariants in the database RPC', () => {
    expect(migration).toContain("requested_status = 'retry' and (requested_next_attempt_at is null or requested_next_attempt_at <= now()")
    expect(migration).toContain("requested_status = 'failed' and claimed.attempt_count < 5")
    expect(migration).toContain("status <> 'processing' and claimed_at is null and claimed_by is null")
  })

  it('preserves orphan history independently of the original submission', () => {
    const original = readFileSync('supabase/migrations/20260712_create_profile_media_moderation.sql', 'utf8')
    expect(original).toContain('on delete set null')
  })
})
