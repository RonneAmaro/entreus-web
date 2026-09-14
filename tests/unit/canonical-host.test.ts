import { describe, expect, it } from 'vitest'
import { getCanonicalProductionUrl } from '../../lib/canonical-host'

describe('canonical production host', () => {
  it.each([
    'https://entreus.com.br/feed?tab=following',
    'https://entreus.vercel.app/login?next=%2Ffeed',
    'https://entreus-web.vercel.app/auth/callback?code=oauth-code',
  ])('redirects the production alias %s to www while preserving path and query', (value) => {
    expect(getCanonicalProductionUrl(new URL(value))?.toString()).toBe(
      value.replace(/^https:\/\/[^/]+/, 'https://www.entreus.com.br'),
    )
  })

  it.each([
    'https://www.entreus.com.br/feed',
    'https://entreus-a4femp06s-ronneamaros-projects.vercel.app/feed',
    'http://localhost:3000/feed',
  ])('does not redirect the canonical, Preview, or local host %s', (value) => {
    expect(getCanonicalProductionUrl(new URL(value))).toBeNull()
  })
})
