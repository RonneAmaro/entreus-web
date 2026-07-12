import { canViewAdultContent, isAdultPost, type ContentAccessProfile } from './content-access'
import { isPaidPost } from './paid-posts'
import { evaluateProtectedPostAccess, protectPostForViewer, type ProtectedPostLike } from './protected-post-access'

export { getSafeProfileContentMode, type ProfileContentMode } from './profile-content-mode'

export type CreatorProfilePost = ProtectedPostLike & {
  id: string
  user_id: string
  is_paid?: boolean | null
  price_itacash?: number | null
}

export type CreatorProfileViewer = {
  viewerId?: string | null
  viewerProfile?: ContentAccessProfile | null
  isAdmin?: boolean | null
  isAuthor?: boolean | null
  isFollowingAuthor?: boolean | null
}

export type AdultAccessState =
  | 'signed_out'
  | 'authorized'
  | 'minor'
  | 'verification_required'
  | 'opt_in_required'

export type CreatorExclusivePostAccessReason =
  | 'not_exclusive'
  | 'signed_out'
  | 'adult_blocked'
  | 'paid_locked'
  | 'allowed'

export type CreatorExclusivePostAccess<TPost extends CreatorProfilePost> = {
  listable: boolean
  contentAllowed: boolean
  reason: CreatorExclusivePostAccessReason
  sanitizedPost: TPost
}

export type CreatorProfileRepost = {
  id: string
  post_id: string
  user_id: string
  created_at: string
  profiles?: unknown
}

export type CreatorProfilePayloadInput<TPost extends CreatorProfilePost> = {
  posts: TPost[]
  reposts?: CreatorProfileRepost[]
  mediaByPost?: Record<string, unknown[]>
  unlockedPostIds?: Set<string>
  followingAuthorIds?: Set<string>
  viewer: CreatorProfileViewer
}

export function isPublicCreatorProfilePost(post: CreatorProfilePost) {
  return !isAdultPost(post) && !isPaidPost(post)
}

export function isExclusiveCreatorProfilePost(post: CreatorProfilePost) {
  return isAdultPost(post) || isPaidPost(post)
}

export function getAdultAccessState(viewer: CreatorProfileViewer): AdultAccessState {
  if (!viewer.viewerId) return 'signed_out' as const
  if (viewer.isAdmin || viewer.isAuthor) return 'authorized' as const
  if (canViewAdultContent(viewer.viewerProfile)) return 'authorized' as const
  if (viewer.viewerProfile?.isMinor === true) return 'minor' as const
  if (viewer.viewerProfile?.ageVerificationStatus !== 'approved') return 'verification_required' as const
  if (viewer.viewerProfile?.wants18Plus !== true) return 'opt_in_required' as const
  return 'verification_required' as const
}

export function getExclusiveAccessState(viewer: CreatorProfileViewer) {
  return viewer.viewerId ? 'available' as const : 'signed_out' as const
}

export function getCreatorExclusivePostAccess<TPost extends CreatorProfilePost>(
  post: TPost,
  viewer: CreatorProfileViewer,
): CreatorExclusivePostAccess<TPost> {
  if (!isExclusiveCreatorProfilePost(post)) {
    return {
      listable: false,
      contentAllowed: false,
      reason: 'not_exclusive',
      sanitizedPost: post,
    }
  }

  const isAdmin = Boolean(viewer.isAdmin)
  const isAuthor = Boolean(viewer.isAuthor || (viewer.viewerId && viewer.viewerId === post.user_id))

  if (!viewer.viewerId && !isAdmin && !isAuthor) {
    return {
      listable: false,
      contentAllowed: false,
      reason: 'signed_out',
      sanitizedPost: protectPostForViewer({
        post,
        viewerId: viewer.viewerId,
        viewerProfile: viewer.viewerProfile,
        isAdmin,
        isAuthor,
        isFollowingAuthor: viewer.isFollowingAuthor,
        hasPaidUnlock: Boolean(post.paid_unlocked),
      }),
    }
  }

  if (isAdultPost(post) && getAdultAccessState({ ...viewer, isAdmin, isAuthor }) !== 'authorized') {
    return {
      listable: false,
      contentAllowed: false,
      reason: 'adult_blocked',
      sanitizedPost: protectPostForViewer({
        post,
        viewerId: viewer.viewerId,
        viewerProfile: viewer.viewerProfile,
        isAdmin,
        isAuthor,
        isFollowingAuthor: viewer.isFollowingAuthor,
        hasPaidUnlock: Boolean(post.paid_unlocked),
      }),
    }
  }

  const access = evaluateProtectedPostAccess({
    post,
    viewerId: viewer.viewerId,
    viewerProfile: viewer.viewerProfile,
    isAdmin,
    isAuthor,
    isFollowingAuthor: viewer.isFollowingAuthor,
    hasPaidUnlock: Boolean(post.paid_unlocked),
  })

  return {
    listable: access.allowed || access.reason === 'paid',
    contentAllowed: access.allowed,
    reason: access.reason === 'paid' ? 'paid_locked' : access.allowed ? 'allowed' : 'not_exclusive',
    sanitizedPost: protectPostForViewer({
      post,
      viewerId: viewer.viewerId,
      viewerProfile: viewer.viewerProfile,
      isAdmin,
      isAuthor,
      isFollowingAuthor: viewer.isFollowingAuthor,
      hasPaidUnlock: Boolean(post.paid_unlocked),
    }),
  }
}

export function prepareCreatorPublicPosts<TPost extends CreatorProfilePost>(
  posts: TPost[],
  viewer: CreatorProfileViewer,
) {
  return posts
    .filter(isPublicCreatorProfilePost)
    .map((post) => ({
      post,
      access: evaluateProtectedPostAccess({
        post,
        viewerId: viewer.viewerId,
        viewerProfile: viewer.viewerProfile,
        isAdmin: viewer.isAdmin,
        isAuthor: viewer.viewerId === post.user_id,
        isFollowingAuthor: viewer.isFollowingAuthor,
        hasPaidUnlock: Boolean(post.paid_unlocked),
      }),
    }))
    .filter(({ access }) => access.allowed)
    .map(({ post }) =>
      protectPostForViewer({
        post,
        viewerId: viewer.viewerId,
        viewerProfile: viewer.viewerProfile,
        isAdmin: viewer.isAdmin,
        isAuthor: viewer.viewerId === post.user_id,
        isFollowingAuthor: viewer.isFollowingAuthor,
        hasPaidUnlock: Boolean(post.paid_unlocked),
      }),
    )
}

export function prepareCreatorExclusivePosts<TPost extends CreatorProfilePost>(
  posts: TPost[],
  viewer: CreatorProfileViewer,
) {
  return posts
    .map((post) => getCreatorExclusivePostAccess(post, viewer))
    .filter((access) => access.listable)
    .map((access) => access.sanitizedPost)
}

export function canCreatorBuyOwnPost(post: CreatorProfilePost, viewerId?: string | null) {
  return Boolean(viewerId && post.user_id !== viewerId && isPaidPost(post))
}

export function shouldRequestSignedUrlForCreatorPost(
  post: CreatorProfilePost,
  viewer: CreatorProfileViewer,
) {
  return evaluateProtectedPostAccess({
    post,
    viewerId: viewer.viewerId,
    viewerProfile: viewer.viewerProfile,
    isAdmin: viewer.isAdmin,
    isAuthor: viewer.isAuthor,
    isFollowingAuthor: viewer.isFollowingAuthor,
    hasPaidUnlock: Boolean(post.paid_unlocked),
  }).allowed
}

export function buildCreatorProfilePostsPayload<TPost extends CreatorProfilePost>(
  input: CreatorProfilePayloadInput<TPost>,
) {
  const postsWithAccess = input.posts.map((post) => {
    const paidUnlocked = post.user_id === input.viewer.viewerId || Boolean(input.unlockedPostIds?.has(post.id))

    return {
      ...post,
      media: input.mediaByPost?.[post.id] || post.media || [],
      paid_unlocked: paidUnlocked,
    } as TPost
  })

  const publicPosts: TPost[] = []
  const exclusivePosts: TPost[] = []

  for (const post of postsWithAccess) {
    const viewer = {
      ...input.viewer,
      isAuthor: false,
      isFollowingAuthor: Boolean(input.followingAuthorIds?.has(post.user_id)),
    }

    if (isPublicCreatorProfilePost(post)) {
      publicPosts.push(...prepareCreatorPublicPosts([post], viewer))
      continue
    }

    const exclusiveAccess = getCreatorExclusivePostAccess(post, viewer)
    if (exclusiveAccess.listable) {
      exclusivePosts.push(exclusiveAccess.sanitizedPost)
    }
  }

  const returnedPostIds = new Set([...publicPosts, ...exclusivePosts].map((post) => post.id))

  return {
    access: getExclusiveAccessState(input.viewer),
    posts: [...publicPosts, ...exclusivePosts],
    reposts: (input.reposts || []).filter((repost) => returnedPostIds.has(repost.post_id)),
  }
}
