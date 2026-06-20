import { describe, expect, it } from 'vitest'

import { getUserTierLabel, resolveUserTier } from '../../lib/user-tiers'

const now = Date.parse('2026-06-20T00:00:00.000Z')

describe('user tiers', () => {
  it('resolves standard users without active benefits', () => {
    expect(resolveUserTier({}, now)).toBe('standard')
    expect(resolveUserTier({ vipStatus: 'active', vipExpiresAt: '2026-06-19T00:00:00.000Z' }, now)).toBe(
      'standard',
    )
  })

  it('resolves active VIP from subscription data or VIP badges', () => {
    expect(resolveUserTier({ vipStatus: 'active', vipExpiresAt: '2026-06-21T00:00:00.000Z' }, now)).toBe(
      'vip',
    )
    expect(resolveUserTier({ badgeSlugs: ['vip-plus'] }, now)).toBe('vip')
  })

  it('prioritizes higher permanent tiers over VIP', () => {
    expect(resolveUserTier({ badgeSlugs: ['vip', 'vip_premium'] }, now)).toBe('vip_premium')
    expect(resolveUserTier({ badgeSlugs: ['vip', 'vip_premium', 'elder'] }, now)).toBe('elder')
  })

  it('returns readable labels for each tier', () => {
    expect(getUserTierLabel('standard')).toBe('Usuario')
    expect(getUserTierLabel('vip')).toBe('VIP')
    expect(getUserTierLabel('vip_premium')).toBe('VIP Premium')
    expect(getUserTierLabel('elder')).toBe('Anciao')
  })
})
