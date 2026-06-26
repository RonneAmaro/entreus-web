import { describe, expect, it } from 'vitest'

import {
  getBadgeIconConfig,
  getBadgeStackLabel,
  getVisibleBadgeIcons,
  normalizeBadgeIconSlug,
  resolveBadgeIcon,
  sortBadgeIconInputs,
} from '../../lib/badge-icons'

describe('badge icon display helpers', () => {
  it('normalizes badge slugs without changing badge grant rules', () => {
    expect(normalizeBadgeIconSlug('Anciao')).toBe('anciao')
    expect(normalizeBadgeIconSlug('VIP Premium')).toBe('vip-premium')
  })

  it('maps real PNG assets for known visual badges', () => {
    expect(getBadgeIconConfig('elder').imageSrc).toBe('/badges/anciao.png')
    expect(getBadgeIconConfig('community').imageSrc).toBe('/badges/comunidade.png')
    expect(getBadgeIconConfig('vip_premium').imageSrc).toBe('/badges/vip-premium.png')
  })

  it('keeps simple VIP on a visual fallback when no dedicated PNG exists', () => {
    const config = getBadgeIconConfig('vip')

    expect(config.imageSrc).toBeNull()
    expect(config.fallbackText).toBe('VIP')
  })

  it('sorts badges by the public hierarchy before limiting visible items', () => {
    const badges = [
      { id: 'community', slug: 'community', name: 'Comunidade' },
      { id: 'vip', slug: 'vip', name: 'VIP' },
      { id: 'elder', slug: 'elder', name: 'Anciao' },
      { id: 'vip_premium', slug: 'vip_premium', name: 'VIP Premium' },
    ]

    expect(sortBadgeIconInputs(badges).map((badge) => badge.slug)).toEqual([
      'elder',
      'vip_premium',
      'vip',
      'community',
    ])
    expect(getVisibleBadgeIcons(badges, 2).map((badge) => badge.slug)).toEqual([
      'elder',
      'vip_premium',
    ])
  })

  it('builds accessible labels for individual badges and stacks', () => {
    const badge = resolveBadgeIcon({ slug: 'community', name: 'Comunidade', title: 'Participante ativo' })

    expect(badge.accessibleLabel).toBe('Selo Comunidade - Participante ativo')
    expect(getBadgeStackLabel([{ slug: 'elder', name: 'Anciao' }, { slug: 'community', name: 'Comunidade' }])).toBe(
      'Selos: Anciao, Comunidade',
    )
  })
})
