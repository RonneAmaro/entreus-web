import { describe, expect, it } from 'vitest'

import {
  PROFILE_THEMES,
  canUseProfileTheme,
  getEffectiveProfileTheme,
  getEffectiveProfileThemeKey,
  getProfileTheme,
  isTeamProfileTheme,
} from '../../lib/profile-themes'

describe('profile themes', () => {
  it('falls back to the default theme for invalid or unavailable values', () => {
    expect(getProfileTheme('missing-theme').key).toBe('default')
    expect(getEffectiveProfileThemeKey('missing-theme', 'elder')).toBe('default')
    expect(getEffectiveProfileTheme('vip-blue', 'standard').key).toBe('default')
  })

  it('keeps premium themes gated by tier', () => {
    expect(canUseProfileTheme('standard', 'vip-blue')).toBe(false)
    expect(canUseProfileTheme('vip', 'vip-blue')).toBe(true)
    expect(canUseProfileTheme('vip', 'vip-premium-fuchsia')).toBe(false)
    expect(canUseProfileTheme('vip_premium', 'vip-premium-fuchsia')).toBe(true)
    expect(canUseProfileTheme('vip_premium', 'elder-gold')).toBe(false)
    expect(canUseProfileTheme('elder', 'elder-gold')).toBe(true)
  })

  it('keeps team color themes available to standard users', () => {
    const teamThemes = PROFILE_THEMES.filter((theme) => theme.category === 'team')

    expect(teamThemes.map((theme) => theme.key)).toEqual([
      'team-brazil',
      'team-argentina',
      'team-france',
      'team-portugal',
      'team-germany',
      'team-congo',
      'team-japan',
      'team-usa',
    ])
    expect(teamThemes.every((theme) => theme.minimumTier === 'standard')).toBe(true)
    expect(teamThemes.every((theme) => canUseProfileTheme('standard', theme.key))).toBe(true)
  })

  it('returns the expected team palette classes', () => {
    const brazil = getProfileTheme('team-brazil')
    const congo = getProfileTheme('team-congo')

    expect(isTeamProfileTheme('team-brazil')).toBe(true)
    expect(brazil.postAccentClassName).toContain('green')
    expect(brazil.postAccentClassName).toContain('yellow')
    expect(congo.postAccentClassName).toContain('sky')
    expect(congo.postAccentClassName).toContain('red')
  })
})
