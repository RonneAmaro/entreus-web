import { describe, expect, it } from 'vitest'

import {
  getProfileVisuals,
  resolveProfileVisualStatus,
} from '../../lib/profile-visuals'

describe('profile visuals', () => {
  it('keeps a safe fallback for common users and unknown themes', () => {
    const visuals = getProfileVisuals({ themeKey: 'unknown-theme' })

    expect(visuals.status).toBe('standard')
    expect(visuals.label).toBe('Usuario')
    expect(visuals.theme.key).toBe('default')
    expect(visuals.postClassName).toBe('')
  })

  it.each([
    ['vip', 'VIP', 'sky'],
    ['vip_premium', 'VIP Premium', 'fuchsia'],
    ['elder', 'Anciao', 'amber'],
  ] as const)('returns the expected treatment for %s', (tier, label, color) => {
    const visuals = getProfileVisuals({ tier })

    expect(visuals.label).toBe(label)
    expect(visuals.avatarClassName).toContain(color)
    expect(visuals.postClassName).toContain(color)
  })

  it('applies status priority before creator roles', () => {
    expect(resolveProfileVisualStatus({ tier: 'elder', isFoundingCreator: true })).toBe('elder')
    expect(resolveProfileVisualStatus({ tier: 'vip_premium', isFoundingCreator: true })).toBe('vip_premium')
    expect(resolveProfileVisualStatus({ tier: 'vip', isCreator: true })).toBe('vip')
    expect(resolveProfileVisualStatus({ isFoundingCreator: true, isCreator: true })).toBe('founding_creator')
    expect(resolveProfileVisualStatus({ isCreator: true })).toBe('creator')
  })

  it('does not activate a theme unavailable to the current tier', () => {
    expect(getProfileVisuals({ tier: 'standard', themeKey: 'elder-gold' }).theme.key).toBe('default')
  })
})
