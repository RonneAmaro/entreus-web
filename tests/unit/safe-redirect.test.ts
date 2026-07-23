import { describe, expect, it } from 'vitest'
import {
  buildRecoveryRedirectUrl,
  getSafeInternalRedirect,
  getSafeRedirectParam,
} from '../../lib/auth/safe-redirect'

describe('safe redirect helper', () => {
  it('accepts internal paths', () => {
    expect(getSafeInternalRedirect('/creator-dashboard')).toBe('/creator-dashboard')
    expect(getSafeInternalRedirect('/creator-studio?tab=content')).toBe('/creator-studio?tab=content')
  })

  it('rejects external or malformed destinations', () => {
    expect(getSafeInternalRedirect('https://evil.example/path')).toBe('/feed')
    expect(getSafeInternalRedirect('//evil.example/path')).toBe('/feed')
    expect(getSafeInternalRedirect('javascript:alert(1)')).toBe('/feed')
    expect(getSafeInternalRedirect('\\evil.example\\path')).toBe('/feed')
  })

  it('reads the first safe redirect parameter from known keys', () => {
    expect(getSafeRedirectParam(new URLSearchParams('next=%2Fcreator-dashboard'))).toBe('/creator-dashboard')
    expect(getSafeRedirectParam(new URLSearchParams('redirectTo=https%3A%2F%2Fevil.example'))).toBe('/feed')
    expect(getSafeRedirectParam(new URLSearchParams('callbackUrl=%2Fcomplete-profile'))).toBe('/complete-profile')
  })

  it('builds the recovery redirect using the current origin', () => {
    expect(buildRecoveryRedirectUrl('https://entreus.example.com/')).toBe(
      'https://entreus.example.com/reset-password?flow=recovery',
    )
  })
})
