import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/auth/callback/page.tsx', 'utf8')

describe('auth callback redirect safety', () => {
  it('uses the shared safe redirect helper for callback destinations', () => {
    expect(source).toContain("getSafeRedirectParam(searchParams, '/feed')")
    expect(source).toContain("router.replace(blocksMinorAccess(completedProfile) ? '/account-pending' : safeNext)")
  })

  it('keeps password recovery redirected only to the internal reset flow', () => {
    expect(source).toContain("window.location.replace(`/reset-password?flow=recovery${recoveryHash}`)")
    expect(source).not.toContain('window.location.replace(searchParams.get')
  })
})
