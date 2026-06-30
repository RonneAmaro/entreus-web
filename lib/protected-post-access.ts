import { canViewAdultContent, isAdultPost, type ContentAccessProfile } from './content-access'
import { isPaidPost } from './paid-posts'
import { isModeratedHidden, type ModeratedPostFields } from './post-moderation'

export type ProtectedPostVisibility = 'public' | 'followers' | 'private'

export type ProtectedPostAccessReason =
  | 'allowed'
  | 'moderation'
  | 'adult'
  | 'visibility'
  | 'paid'

export type ProtectedPostMediaLike = Record<string, unknown> & {
  media_url?: unknown
  url?: unknown
  public_url?: unknown
  preview_url?: unknown
  thumbnail_url?: unknown
  storage_bucket?: unknown
  storage_key?: unknown
}

export type ProtectedPostLike = ModeratedPostFields &
  Record<string, unknown> & {
    id?: string | null
    user_id?: string | null
    content?: string | null
    image_url?: string | null
    video_url?: string | null
    media_url?: string | null
    preview_url?: string | null
    thumbnail_url?: string | null
    media?: ProtectedPostMediaLike[] | null
    visibility?: ProtectedPostVisibility | string | null
    is_paid?: unknown
    price_itacash?: unknown
    paid_unlocked?: unknown
    community_type?: unknown
    content_rating?: unknown
    category?: unknown
  }

export type ProtectedPostAccessInput<TPost extends ProtectedPostLike> = {
  post: TPost
  viewerId?: string | null
  viewerProfile?: ContentAccessProfile | null
  isAdmin?: boolean | null
  isAuthor?: boolean | null
  isFollowingAuthor?: boolean | null
  canViewVisibility?: boolean | null
  hasPaidUnlock?: boolean | null
}

export type ProtectedPostAccessDecision = {
  allowed: boolean
  reason: ProtectedPostAccessReason
  isAdmin: boolean
  isAuthor: boolean
  isAdultAllowed: boolean
  isVisibilityAllowed: boolean
  isPaidAllowed: boolean
}

export const PROTECTED_POST_REMOVED_FIELDS = [
  'content',
  'image_url',
  'video_url',
  'media',
  'media_url',
  'preview_url',
  'thumbnail_url',
] as const

export function isProtectedPostAuthor(post: ProtectedPostLike, viewerId?: string | null) {
  return Boolean(viewerId && post.user_id && viewerId === post.user_id)
}

export function canViewProtectedPostVisibility(input: {
  visibility?: ProtectedPostVisibility | string | null
  isAdmin?: boolean | null
  isAuthor?: boolean | null
  isFollowingAuthor?: boolean | null
  canViewVisibility?: boolean | null
}) {
  if (input.isAdmin || input.isAuthor || input.canViewVisibility) return true

  const visibility = input.visibility || 'public'
  if (visibility === 'public') return true
  if (visibility === 'followers') return Boolean(input.isFollowingAuthor)
  return false
}

export function evaluateProtectedPostAccess<TPost extends ProtectedPostLike>(
  input: ProtectedPostAccessInput<TPost>,
): ProtectedPostAccessDecision {
  const isAdmin = Boolean(input.isAdmin)
  const isAuthor = Boolean(input.isAuthor ?? isProtectedPostAuthor(input.post, input.viewerId))

  if (isModeratedHidden(input.post) && !isAdmin) {
    return {
      allowed: false,
      reason: 'moderation',
      isAdmin,
      isAuthor,
      isAdultAllowed: false,
      isVisibilityAllowed: false,
      isPaidAllowed: false,
    }
  }

  const isAdultAllowed = isAdmin || isAuthor || canViewAdultContent(input.viewerProfile)

  if (!isAdultAllowed) {
    if (isAdultPost(input.post)) {
      return {
        allowed: false,
        reason: 'adult',
        isAdmin,
        isAuthor,
        isAdultAllowed,
        isVisibilityAllowed: false,
        isPaidAllowed: false,
      }
    }
  }

  const isVisibilityAllowed = canViewProtectedPostVisibility({
    visibility: input.post.visibility,
    isAdmin,
    isAuthor,
    isFollowingAuthor: input.isFollowingAuthor,
    canViewVisibility: input.canViewVisibility,
  })

  if (!isVisibilityAllowed) {
    return {
      allowed: false,
      reason: 'visibility',
      isAdmin,
      isAuthor,
      isAdultAllowed,
      isVisibilityAllowed,
      isPaidAllowed: false,
    }
  }

  const isPaidAllowed = !isPaidPost(input.post) || isAdmin || isAuthor || Boolean(input.hasPaidUnlock ?? input.post.paid_unlocked)

  if (!isPaidAllowed) {
    return {
      allowed: false,
      reason: 'paid',
      isAdmin,
      isAuthor,
      isAdultAllowed,
      isVisibilityAllowed,
      isPaidAllowed,
    }
  }

  return {
    allowed: true,
    reason: 'allowed',
    isAdmin,
    isAuthor,
    isAdultAllowed,
    isVisibilityAllowed,
    isPaidAllowed,
  }
}

export function sanitizeProtectedPostContent<TPost extends ProtectedPostLike>(post: TPost): TPost {
  return {
    ...post,
    content: null,
    image_url: null,
    video_url: null,
    media_url: null,
    preview_url: null,
    thumbnail_url: null,
    media: [],
  }
}

export function protectPostForViewer<TPost extends ProtectedPostLike>(
  input: ProtectedPostAccessInput<TPost>,
): TPost {
  const decision = evaluateProtectedPostAccess(input)
  const paidUnlocked = isPaidPost(input.post)
    ? decision.isPaidAllowed
    : input.post.paid_unlocked

  const postWithAccess = {
    ...input.post,
    paid_unlocked: paidUnlocked,
  } as TPost

  return decision.allowed ? postWithAccess : sanitizeProtectedPostContent(postWithAccess)
}

export function protectPostsForViewer<TPost extends ProtectedPostLike>(
  posts: TPost[],
  getInput: (post: TPost) => Omit<ProtectedPostAccessInput<TPost>, 'post'>,
) {
  return posts.map((post) => protectPostForViewer({ post, ...getInput(post) }))
}
