import { canCreateAdultPost, type ContentAccessProfile } from '@/lib/content-access'

export type PostMediaAccessLevel = 'public' | 'adult_private'

export function resolvePostMediaAccessLevel(input: {
  communityType?: unknown
  contentRating?: unknown
  accessLevel?: unknown
}) : PostMediaAccessLevel | null {
  const requestedAdult =
    input.accessLevel === 'adult_private' ||
    input.communityType === 'adult_18plus' ||
    input.contentRating === 'adult_18plus'

  if (requestedAdult) {
    if (input.communityType && input.communityType !== 'adult_18plus') return null
    if (input.contentRating && input.contentRating !== 'adult_18plus') return null
    return 'adult_private'
  }

  return input.accessLevel === undefined || input.accessLevel === 'public' ? 'public' : null
}

export function canPreparePostMediaUpload(
  accessLevel: PostMediaAccessLevel,
  profile: ContentAccessProfile | null | undefined,
) {
  return accessLevel !== 'adult_private' || canCreateAdultPost(profile)
}
