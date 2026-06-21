import { describe, expect, it } from 'vitest'
import { collectPreflightChecks, requiredFiles, requiredScripts } from '../../scripts/preflight-18plus-private-media'

describe('18+ private media QA preflight', () => {
  it('tracks the critical implementation files and commands', () => {
    expect(requiredFiles).toContain('app/components/ProtectedPostMedia.tsx')
    expect(requiredFiles).toContain('app/api/post-media/[mediaId]/signed-url/route.ts')
    expect(requiredScripts).toContain('audit:adult-media')
  })

  it('passes local structural checks without external services', () => {
    const checks = collectPreflightChecks()
    expect(checks).toHaveLength(requiredFiles.length + requiredScripts.length)
    expect(checks.every((check: { status: string }) => check.status === 'ok')).toBe(true)
  })
})
