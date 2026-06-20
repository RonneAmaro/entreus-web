import { describe, expect, it } from 'vitest'

import {
  canViewerSeePostClassification,
  getSafePostCommunity,
  getSafePostContentRating,
  resolvePostContentRating,
  shouldShowInGeneralFeed,
} from '../../lib/post-classification'

describe('post classification', () => {
  it('keeps the general feed restricted to safe general posts', () => {
    expect(shouldShowInGeneralFeed('general', 'safe')).toBe(true)
    expect(shouldShowInGeneralFeed('general', 'sensitive')).toBe(false)
    expect(shouldShowInGeneralFeed('sports', 'safe')).toBe(false)
    expect(shouldShowInGeneralFeed('adult_18plus', 'adult_18plus')).toBe(false)
  })

  it('blocks adult posts unless the viewer is eligible', () => {
    expect(canViewerSeePostClassification(null, 'adult_18plus', 'adult_18plus')).toBe(false)
    expect(
      canViewerSeePostClassification(
        { isMinor: true, wants18Plus: true, ageVerificationStatus: 'approved' },
        'adult_18plus',
        'adult_18plus',
      ),
    ).toBe(false)
    expect(
      canViewerSeePostClassification(
        { isMinor: false, wants18Plus: false, ageVerificationStatus: 'approved' },
        'adult_18plus',
        'adult_18plus',
      ),
    ).toBe(false)
    expect(
      canViewerSeePostClassification(
        { isMinor: false, wants18Plus: true, ageVerificationStatus: 'pending' },
        'adult_18plus',
        'adult_18plus',
      ),
    ).toBe(false)
    expect(
      canViewerSeePostClassification(
        { isMinor: false, wants18Plus: true, ageVerificationStatus: 'approved' },
        'adult_18plus',
        'adult_18plus',
      ),
    ).toBe(true)
  })

  it('normalizes invalid classification inputs to safe defaults', () => {
    expect(getSafePostCommunity('unknown')).toBe('general')
    expect(getSafePostContentRating('unknown')).toBe('safe')
    expect(resolvePostContentRating('geopolitics')).toBe('sensitive')
    expect(resolvePostContentRating('adult_18plus', 'safe')).toBe('adult_18plus')
  })
})
