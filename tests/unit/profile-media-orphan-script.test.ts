import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseProfileMediaCleanupUrl } from '../../scripts/cleanup-profile-media-orphans.mjs'

describe('profile media orphan cleanup manual script transport', () => {
  it('does not load the complete .env.local file', () => {
    const packageJson = readFileSync('package.json', 'utf8')
    expect(packageJson).toContain('"cleanup:profile-media-orphans": "node scripts/cleanup-profile-media-orphans.mjs"')
    expect(packageJson).not.toContain('--env-file=.env.local scripts/cleanup-profile-media-orphans.mjs')
  })

  it('accepts HTTPS and loopback HTTP only on the exact internal route', () => {
    expect(parseProfileMediaCleanupUrl('https://example.test/api/internal/profile-media-orphan-cleanup')).toBe('https://example.test/api/internal/profile-media-orphan-cleanup')
    expect(parseProfileMediaCleanupUrl('http://localhost:3000/api/internal/profile-media-orphan-cleanup')).toBe('http://localhost:3000/api/internal/profile-media-orphan-cleanup')
    expect(parseProfileMediaCleanupUrl('http://127.0.0.1:3000/api/internal/profile-media-orphan-cleanup')).toBe('http://127.0.0.1:3000/api/internal/profile-media-orphan-cleanup')
    expect(parseProfileMediaCleanupUrl('http://[::1]:3000/api/internal/profile-media-orphan-cleanup')).toBe('http://[::1]:3000/api/internal/profile-media-orphan-cleanup')
  })

  it('rejects remote HTTP, credentials, query, hash and wrong paths', () => {
    for (const url of [
      'http://example.test/api/internal/profile-media-orphan-cleanup',
      'https://user:pass@example.test/api/internal/profile-media-orphan-cleanup',
      'https://example.test/api/internal/profile-media-orphan-cleanup?secret=x',
      'https://example.test/api/internal/profile-media-orphan-cleanup#x',
      'https://example.test/other',
    ]) expect(parseProfileMediaCleanupUrl(url)).toBeNull()
  })
})
