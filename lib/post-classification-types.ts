export type PostCommunityType =
  | 'general'
  | 'sports'
  | 'geopolitics'
  | 'military'
  | 'adult_18plus'

export type PostContentRating = 'safe' | 'sensitive' | 'adult_18plus'

const communityKeys = new Set<PostCommunityType>([
  'general', 'sports', 'geopolitics', 'military', 'adult_18plus',
])
const ratingKeys = new Set<PostContentRating>(['safe', 'sensitive', 'adult_18plus'])

export function isPostCommunityType(value: unknown): value is PostCommunityType {
  return typeof value === 'string' && communityKeys.has(value as PostCommunityType)
}

export function isPostContentRating(value: unknown): value is PostContentRating {
  return typeof value === 'string' && ratingKeys.has(value as PostContentRating)
}

export function getSafePostCommunity(value: unknown): PostCommunityType {
  return isPostCommunityType(value) ? value : 'general'
}

export function getSafePostContentRating(value: unknown): PostContentRating {
  return isPostContentRating(value) ? value : 'safe'
}
