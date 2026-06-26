import { isModeratedHidden, type ModeratedPostFields } from './post-moderation'
import { canReceiveRenderablePost, type PostVisibilityContext } from './post-visibility'
import { canViewPaidPostContent, isPaidPost } from './paid-posts'
import { resolvePostMediaAccessLevel } from './media/post-media-access'
import type { ContentAccessProfile } from './content-access'

export type ProtectedPostAccessReason =
  | 'allowed'
  | 'moderation'
  | 'adult'
  | 'visibility'
  | 'paywall'

export type ProtectedPostViewer = {
  userId?: string | null
  isAdmin?: boolean
  profile?: ContentAccessProfile | null
  followingUserIds?: readonly string[]
  unlockedPostIds?: readonly string[]
}

export type ProtectedPostMedia = {
  id: string
  post_id?: string | null
  user_id?: string | null
  media_url?: string | null
  media_type?: 'image' | 'video' | 'gif' | string | null
  position?: number | null
  created_at?: string | null
  access_level?: string | null
}

export type ProtectedPostLike = ModeratedPostFields & {
  id: string
  user_id: string
  content?: string | null
  image_url?: string | null
  video_url?: string | null
  visibility?: 'public' | 'followers' | 'private' | string | null
  category?: string | null
  community_type?: string | null
  content_rating?: string | null
  is_paid?: boolean | null
  price_itacash?: number | null
  paid_unlocked?: boolean
  media?: ProtectedPostMedia[]
  [key: string]: unknown
}

export type ProtectedPostAccessResult<T extends ProtectedPostLike> = {
  postId: string
  visible: boolean
  contentAllowed: boolean
  reason: ProtectedPostAccessReason
  post: T | null
}

const PREVIEW_FIELDS = [
  'preview',
  'previews',
  'preview_url',
  'link_preview',
  'link_previews',
  'open_graph',
  'og_title',
  'og_description',
  'og_image',
]

function isFollowingAuthor(viewer: ProtectedPostViewer, authorId: string) {
  return Boolean(authorId && viewer.followingUserIds?.includes(authorId))
}

export function canViewPostByVisibility(post: ProtectedPostLike, viewer: ProtectedPostViewer) {
  if (viewer.isAdmin) return true
  if (viewer.userId && viewer.userId === post.user_id) return true

  const visibility = post.visibility || 'public'
  if (visibility === 'public') return true
  if (visibility === 'followers') return isFollowingAuthor(viewer, post.user_id)
  if (visibility === 'private') return false

  return false
}

function hasUnlockedPaidPost(post: ProtectedPostLike, viewer: ProtectedPostViewer) {
  return Boolean(post.paid_unlocked || viewer.unlockedPostIds?.includes(post.id))
}

function isProtectedMediaForDirectResponse(post: ProtectedPostLike, media: ProtectedPostMedia) {
  const accessLevel = resolvePostMediaAccessLevel({
    communityType: post.community_type,
    contentRating: post.content_rating,
    accessLevel: media.access_level || undefined,
  })

  return accessLevel === 'adult_private' || accessLevel === 'protected'
}

export function sanitizeAuthorizedPostMedia<T extends ProtectedPostMedia>(
  post: ProtectedPostLike,
  media: readonly T[] | null | undefined,
): T[] {
  return (media || []).map((item) => {
    if (!isProtectedMediaForDirectResponse(post, item)) return item

    return {
      ...item,
      media_url: null,
    }
  })
}

export function sanitizeProtectedPostContent<T extends ProtectedPostLike>(post: T): T {
  const sanitizedPost = {
    ...post,
    content: null,
    image_url: null,
    video_url: null,
    media: [],
  } as T
  const sanitizedRecord = sanitizedPost as Record<string, unknown>

  for (const field of PREVIEW_FIELDS) {
    if (field in sanitizedRecord) {
      sanitizedRecord[field] = null
    }
  }

  return sanitizedPost
}

export function authorizePostForViewer<T extends ProtectedPostLike>(
  post: T,
  viewer: ProtectedPostViewer,
  context: PostVisibilityContext,
): ProtectedPostAccessResult<T> {
  const effectiveContext = viewer.isAdmin ? 'admin' : context

  if (effectiveContext !== 'admin' && isModeratedHidden(post)) {
    return {
      postId: post.id,
      visible: false,
      contentAllowed: false,
      reason: 'moderation',
      post: null,
    }
  }

  if (!canReceiveRenderablePost(viewer.profile, post, effectiveContext)) {
    return {
      postId: post.id,
      visible: true,
      contentAllowed: false,
      reason: 'adult',
      post: sanitizeProtectedPostContent(post),
    }
  }

  if (!canViewPostByVisibility(post, viewer)) {
    return {
      postId: post.id,
      visible: false,
      contentAllowed: false,
      reason: 'visibility',
      post: null,
    }
  }

  const paidUnlocked = hasUnlockedPaidPost(post, viewer)

  if (isPaidPost(post) && !canViewPaidPostContent(post, viewer.userId, paidUnlocked) && !viewer.isAdmin) {
    return {
      postId: post.id,
      visible: true,
      contentAllowed: false,
      reason: 'paywall',
      post: sanitizeProtectedPostContent({ ...post, paid_unlocked: false }),
    }
  }

  return {
    postId: post.id,
    visible: true,
    contentAllowed: true,
    reason: 'allowed',
    post: {
      ...post,
      paid_unlocked: isPaidPost(post)
        ? Boolean(viewer.isAdmin || viewer.userId === post.user_id || paidUnlocked)
        : Boolean(post.paid_unlocked),
      media: sanitizeAuthorizedPostMedia(post, post.media),
    },
  }
}

export function authorizePostsForViewer<T extends ProtectedPostLike>(
  posts: readonly T[],
  viewer: ProtectedPostViewer,
  context: PostVisibilityContext,
) {
  return posts.map((post) => authorizePostForViewer(post, viewer, context))
}
