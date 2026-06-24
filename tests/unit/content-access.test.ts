import { describe, expect, it } from 'vitest'

import {
  canCreateAdultPost,
  canViewAdultContent,
  canViewPostByClassification,
  getBlockedContentReason,
  isAdultPost,
  isLegacyAdultCategory,
  normalizePostClassification,
} from '../../lib/content-access'
import { shouldShowInGeneralFeed } from '../../lib/post-classification'

const adultPost = { community_type: 'adult_18plus', content_rating: 'adult_18plus' }
const approvedAdult = {
  isMinor: false,
  wants18Plus: true,
  ageVerificationStatus: 'approved',
}

describe('content access', () => {
  it('blocks adult content for an anonymous viewer', () => {
    expect(canViewPostByClassification(null, adultPost)).toBe(false)
    expect(getBlockedContentReason(null, adultPost)).toBe('Este conteúdo não está disponível para sua conta.')
  })

  it('blocks adult content for minors, including with parental consent', () => {
    expect(canViewPostByClassification({ isMinor: true, wants18Plus: true, ageVerificationStatus: 'approved' }, adultPost)).toBe(false)
    expect(canViewPostByClassification({ isMinor: true, wants18Plus: true, parentalConsentStatus: 'approved', ageVerificationStatus: 'approved' }, adultPost)).toBe(false)
  })

  it('blocks adult content without approved 18+ verification and for unknown status', () => {
    expect(canViewPostByClassification({ isMinor: false, wants18Plus: true, ageVerificationStatus: 'pending' }, adultPost)).toBe(false)
    expect(canViewPostByClassification({ isMinor: false, wants18Plus: true }, adultPost)).toBe(false)
  })

  it('allows only an opted-in adult with approved age verification', () => {
    expect(canViewAdultContent(approvedAdult)).toBe(true)
    expect(canViewPostByClassification(approvedAdult, adultPost)).toBe(true)
    expect(canCreateAdultPost(approvedAdult)).toBe(true)
    expect(canCreateAdultPost({ isMinor: true, wants18Plus: true, ageVerificationStatus: 'approved' })).toBe(false)
    expect(canCreateAdultPost({ isMinor: false, wants18Plus: true, ageVerificationStatus: 'pending' })).toBe(false)
    expect(canCreateAdultPost({ isMinor: false, wants18Plus: true, ageVerificationStatus: 'rejected' })).toBe(false)
  })

  it('keeps safe posts visible and never admits adult posts to the general feed', () => {
    expect(canViewPostByClassification(null, { community_type: 'general', content_rating: 'safe' })).toBe(true)
    expect(shouldShowInGeneralFeed('general', 'safe')).toBe(true)
    expect(shouldShowInGeneralFeed('adult_18plus', 'adult_18plus')).toBe(false)
  })

  it('normalizes either adult field into the isolated adult classification', () => {
    expect(normalizePostClassification('adult_18plus', 'safe')).toEqual({
      communityType: 'adult_18plus', contentRating: 'adult_18plus',
    })
    expect(normalizePostClassification('general', 'adult_18plus')).toEqual({
      communityType: 'adult_18plus', contentRating: 'adult_18plus',
    })
    expect(isAdultPost({ community_type: 'general', content_rating: 'adult_18plus' })).toBe(true)
    expect(isLegacyAdultCategory('18plus')).toBe(true)
    expect(canViewPostByClassification(null, { category: 'adulto' })).toBe(false)
    expect(normalizePostClassification('general', 'safe', 'sensual')).toEqual({
      communityType: 'adult_18plus', contentRating: 'adult_18plus',
    })
  })
})
