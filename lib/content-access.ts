import {
  getSafePostCommunity,
  getSafePostContentRating,
  type PostCommunityType,
  type PostContentRating,
} from './post-classification-types'

export type ContentAccessProfile = {
  isMinor?: boolean | null
  wants18Plus?: boolean | null
  ageVerificationStatus?: string | null
  parentalConsentStatus?: string | null
}

export type ClassifiedPost = {
  community_type?: unknown
  content_rating?: unknown
  category?: unknown
}

/**
 * Categories used before `community_type` and `content_rating` existed. They
 * remain adult classifications, never merely a UI label.
 */
const LEGACY_ADULT_CATEGORIES = new Set(['adulto', 'sensual', '18plus'])

export function isLegacyAdultCategory(value: unknown) {
  return (
    typeof value === 'string' &&
    LEGACY_ADULT_CATEGORIES.has(value.trim().toLowerCase())
  )
}

export const BLOCKED_CONTENT_MESSAGE = 'Este conteúdo não está disponível para sua conta.'

export function isAdultPost(post: ClassifiedPost) {
  return (
    getSafePostCommunity(post.community_type) === 'adult_18plus' ||
    getSafePostContentRating(post.content_rating) === 'adult_18plus' ||
    isLegacyAdultCategory(post.category)
  )
}

export function isSensitivePost(post: ClassifiedPost) {
  return !isAdultPost(post) && getSafePostContentRating(post.content_rating) === 'sensitive'
}

/** Adult content is opt-in and fail-closed for absent or unknown profile data. */
export function canViewAdultContent(profile: ContentAccessProfile | null | undefined) {
  return Boolean(
    profile &&
      profile.isMinor === false &&
      profile.wants18Plus === true &&
      profile.ageVerificationStatus === 'approved',
  )
}

export function canViewPostByClassification(
  profile: ContentAccessProfile | null | undefined,
  post: ClassifiedPost,
) {
  return !isAdultPost(post) || canViewAdultContent(profile)
}

export function canCreateAdultPost(profile: ContentAccessProfile | null | undefined) {
  return canViewAdultContent(profile)
}

export function getBlockedContentReason(
  profile: ContentAccessProfile | null | undefined,
  post: ClassifiedPost,
) {
  if (!isAdultPost(post) || canViewAdultContent(profile)) return null
  return BLOCKED_CONTENT_MESSAGE
}

/** Keeps the two adult classification fields inseparable at every client insert point. */
export function normalizePostClassification(
  community: unknown,
  rating: unknown,
  category?: unknown,
): { communityType: PostCommunityType; contentRating: PostContentRating } {
  const safeCommunity = getSafePostCommunity(community)
  const safeRating = getSafePostContentRating(rating)

  if (
    safeCommunity === 'adult_18plus' ||
    safeRating === 'adult_18plus' ||
    isLegacyAdultCategory(category)
  ) {
    return { communityType: 'adult_18plus', contentRating: 'adult_18plus' }
  }

  return { communityType: safeCommunity, contentRating: safeRating }
}
