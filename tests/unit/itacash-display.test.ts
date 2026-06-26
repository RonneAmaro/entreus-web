import { describe, expect, it } from 'vitest'

import {
  ITACASH_ICON_SRC,
  formatItaCashAmount,
  getItaCashAmountLabel,
  getItaCashIconConfig,
} from '../../lib/itacash-display'

describe('ItaCash display helpers', () => {
  it('documents the real ItaCash icon path', () => {
    expect(ITACASH_ICON_SRC).toBe('/itacash.png')
    expect(getItaCashIconConfig().imageSrc).toBe('/itacash.png')
  })

  it('formats ItaCash values for Portuguese display', () => {
    expect(formatItaCashAmount(1000)).toBe('1.000')
    expect(formatItaCashAmount('2500')).toBe('2.500')
    expect(formatItaCashAmount(12.5)).toBe('12,5')
  })

  it('keeps an explicit fallback for missing icon images', () => {
    const config = getItaCashIconConfig(false)

    expect(config.imageSrc).toBeNull()
    expect(config.fallbackText).toBe('IC')
    expect(getItaCashAmountLabel(100)).toBe('100 ItaCash')
  })
})
