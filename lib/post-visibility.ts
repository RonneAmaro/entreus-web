import { canViewAdultContent, type ContentAccessProfile } from './content-access'

export type PostVisibilityContext = 'general-feed' | 'public-list' | 'saved' | 'post-detail' | 'admin'

type FilterablePostQuery = {
  eq: (column: string, value: string) => FilterablePostQuery
  neq: (column: string, value: string) => FilterablePostQuery
}

/**
 * Applies classification filters before Supabase returns post rows. This is a
 * defence-in-depth client helper; RLS must enforce the same rule in production.
 */
export function applyPostVisibilityFilters<T>(
  query: T,
  viewer: ContentAccessProfile | null | undefined,
  context: PostVisibilityContext,
): T
export function applyPostVisibilityFilters(
  // Supabase's generated select builder is recursively typed; keeping this
  // boundary untyped avoids exploding TypeScript instantiation in page code.
  query: unknown,
  viewer: ContentAccessProfile | null | undefined,
  context: PostVisibilityContext,
): unknown {
  const filterable = query as FilterablePostQuery
  if (context === 'general-feed') {
    return filterable.eq('community_type', 'general').eq('content_rating', 'safe')
  }

  if (context === 'admin' || canViewAdultContent(viewer)) return query

  return filterable.neq('community_type', 'adult_18plus').neq('content_rating', 'adult_18plus')
}

export function canReceiveRenderablePost(
  viewer: ContentAccessProfile | null | undefined,
  post: { community_type?: unknown; content_rating?: unknown },
  context: PostVisibilityContext,
) {
  if (context === 'admin') return true
  if (context === 'general-feed') {
    return post.community_type === 'general' && post.content_rating === 'safe'
  }
  return !(
    (post.community_type === 'adult_18plus' || post.content_rating === 'adult_18plus') &&
    !canViewAdultContent(viewer)
  )
}
