import {
  canViewPostByClassification,
  isAdultPost,
  type ContentAccessProfile,
} from './content-access'
import {
  canAuthorViewPaidPost,
  canViewPaidPostContent,
  isPaidPost,
  type PaidPostLike,
} from './paid-posts'
import {
  getSafePostCommunity,
  getSafePostContentRating,
  type PostCommunityType,
  type PostContentRating,
} from './post-classification-types'

export const POST_VIEW_SOURCES = ['post', 'feed', 'profile', 'saved'] as const

export type PostViewSource = (typeof POST_VIEW_SOURCES)[number] | 'unknown'

export type PostViewErrorReason =
  | 'not_authenticated'
  | 'missing_post'
  | 'invalid_post'
  | 'post_not_found'
  | 'adult_blocked'
  | 'blocked'
  | 'analytics_unavailable'
  | 'internal'

export type AnalyticsMetric = {
  value: number
  available: boolean
}

export type PostViewRow = {
  post_id?: string | null
  created_at?: string | null
}

export type PostAnalyticsPost = PaidPostLike & {
  id: string
  created_at?: string | null
  visibility?: string | null
  moderation_status?: string | null
}

export type PostAnalyticsSummary = {
  id: string
  createdAt: string | null
  community: PostCommunityType
  rating: PostContentRating
  views: number
  interactions: number
  engagementRate: AnalyticsMetric
}

export type PostViewEligibilityInput = {
  post: PostAnalyticsPost | null | undefined
  viewerId?: string | null
  viewer?: ContentAccessProfile | null
  isAdmin?: boolean | null
  hasUnlocked?: boolean | null
  isFollowingAuthor?: boolean | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DAY_MS = 24 * 60 * 60 * 1000
const SOURCE_SET = new Set<string>(POST_VIEW_SOURCES)

export const POST_VIEW_ERROR_MESSAGES: Record<PostViewErrorReason, string> = {
  not_authenticated: 'Entre na sua conta para registrar a visualizacao.',
  missing_post: 'Post nao encontrado.',
  invalid_post: 'Post invalido.',
  post_not_found: 'Post nao encontrado.',
  adult_blocked: 'Conteudo adulto exige verificacao 18+ aprovada.',
  blocked: 'Voce nao tem permissao para visualizar este post.',
  analytics_unavailable: 'Analytics ainda nao esta disponivel.',
  internal: 'Nao foi possivel registrar a visualizacao agora.',
}

export function getPostViewErrorMessage(reason: PostViewErrorReason) {
  return POST_VIEW_ERROR_MESSAGES[reason] || POST_VIEW_ERROR_MESSAGES.internal
}

export function sanitizePostViewSource(value: unknown): PostViewSource {
  const source = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return SOURCE_SET.has(source) ? (source as PostViewSource) : 'unknown'
}

export function validatePostViewPayload(payload: { postId?: unknown; source?: unknown }) {
  const postId = typeof payload.postId === 'string' ? payload.postId.trim() : ''

  if (!postId) {
    return { ok: false as const, reason: 'missing_post' as const, message: getPostViewErrorMessage('missing_post') }
  }

  if (!UUID_PATTERN.test(postId)) {
    return { ok: false as const, reason: 'invalid_post' as const, message: getPostViewErrorMessage('invalid_post') }
  }

  return {
    ok: true as const,
    value: {
      postId,
      source: sanitizePostViewSource(payload.source),
    },
  }
}

export function normalizePostViewRpcError(error: unknown): PostViewErrorReason {
  const message = typeof error === 'string'
    ? error
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : ''
  const lower = message.toLowerCase()

  if (lower.includes('could not find the function') || lower.includes('record_post_view') || lower.includes('schema cache')) return 'analytics_unavailable'
  if (lower.includes('not authenticated') || lower.includes('jwt') || lower.includes('session')) return 'not_authenticated'
  if (lower.includes('adult') || lower.includes('18+')) return 'adult_blocked'
  if (lower.includes('post not found') || lower.includes('not found')) return 'post_not_found'
  if (lower.includes('not allowed') || lower.includes('not authorized') || lower.includes('permission') || lower.includes('blocked')) return 'blocked'
  return 'internal'
}

export function isMissingPostAnalyticsSchemaError(error: { message?: string } | null | undefined) {
  const message = (error?.message || '').toLowerCase()
  return (
    message.includes('post_views') ||
    message.includes('record_post_view') ||
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('not found')
  )
}

export function normalizeAnalyticsCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

export function calculatePostEngagementRate(interactions: unknown, views: unknown): AnalyticsMetric {
  const normalizedViews = normalizeAnalyticsCount(views)
  if (normalizedViews === 0) return { value: 0, available: false }

  const normalizedInteractions = normalizeAnalyticsCount(interactions)
  return {
    value: Math.round((normalizedInteractions / normalizedViews) * 10_000) / 100,
    available: true,
  }
}

export function countPostViewsByPostId(rows: PostViewRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const postId = typeof row.post_id === 'string' ? row.post_id : ''
    if (!postId) return counts
    counts[postId] = (counts[postId] || 0) + 1
    return counts
  }, {})
}

function getTime(value: string | null | undefined) {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

export function summarizePostViewRows(rows: PostViewRow[], now = new Date()) {
  const nowTime = now.getTime()
  const last7Cutoff = nowTime - 7 * DAY_MS
  const last30Cutoff = nowTime - 30 * DAY_MS
  let last7 = 0
  let last30 = 0

  for (const row of rows) {
    const time = getTime(row.created_at)
    if (time === null) continue
    if (time >= last7Cutoff) last7 += 1
    if (time >= last30Cutoff) last30 += 1
  }

  return {
    total: rows.length,
    last7,
    last30,
    viewsByPostId: countPostViewsByPostId(rows),
  }
}

function postTime(post: PostAnalyticsPost) {
  return getTime(post.created_at) || 0
}

export function toPostAnalyticsSummary(
  post: PostAnalyticsPost,
  viewsByPostId: Record<string, number> = {},
  interactionsByPostId: Record<string, number> = {},
): PostAnalyticsSummary {
  const adult = isAdultPost(post)
  const views = normalizeAnalyticsCount(viewsByPostId[post.id])
  const interactions = normalizeAnalyticsCount(interactionsByPostId[post.id])

  return {
    id: post.id,
    createdAt: post.created_at || null,
    community: adult ? 'adult_18plus' : getSafePostCommunity(post.community_type),
    rating: adult ? 'adult_18plus' : getSafePostContentRating(post.content_rating),
    views,
    interactions,
    engagementRate: calculatePostEngagementRate(interactions, views),
  }
}

export function rankPostsByViews(
  posts: PostAnalyticsPost[],
  viewsByPostId: Record<string, number> = {},
  interactionsByPostId: Record<string, number> = {},
  limit = 5,
) {
  return posts
    .map((post) => toPostAnalyticsSummary(post, viewsByPostId, interactionsByPostId))
    .sort((left, right) => {
      if (right.views !== left.views) return right.views - left.views
      if (right.interactions !== left.interactions) return right.interactions - left.interactions
      const leftPost = posts.find((post) => post.id === left.id)
      const rightPost = posts.find((post) => post.id === right.id)
      return (rightPost ? postTime(rightPost) : 0) - (leftPost ? postTime(leftPost) : 0)
    })
    .slice(0, Math.max(0, limit))
}

export function rankPostsByEngagement(
  posts: PostAnalyticsPost[],
  viewsByPostId: Record<string, number> = {},
  interactionsByPostId: Record<string, number> = {},
  limit = 5,
) {
  return posts
    .map((post) => toPostAnalyticsSummary(post, viewsByPostId, interactionsByPostId))
    .sort((left, right) => {
      if (left.engagementRate.available !== right.engagementRate.available) {
        return right.engagementRate.available ? 1 : -1
      }
      if (right.engagementRate.value !== left.engagementRate.value) {
        return right.engagementRate.value - left.engagementRate.value
      }
      if (right.interactions !== left.interactions) return right.interactions - left.interactions
      if (right.views !== left.views) return right.views - left.views
      const leftPost = posts.find((post) => post.id === left.id)
      const rightPost = posts.find((post) => post.id === right.id)
      return (rightPost ? postTime(rightPost) : 0) - (leftPost ? postTime(leftPost) : 0)
    })
    .slice(0, Math.max(0, limit))
}

export function canCountPostView(input: PostViewEligibilityInput) {
  const { post, viewerId, viewer, isAdmin, hasUnlocked, isFollowingAuthor } = input

  if (!post?.id || !post.user_id || !viewerId) return false

  const admin = Boolean(isAdmin)
  const isAuthor = canAuthorViewPaidPost(viewerId, post.user_id)

  if ((post.moderation_status || 'active') !== 'active' && !admin && !isAuthor) {
    return false
  }

  if (!admin && !canViewPostByClassification(viewer, post)) {
    return false
  }

  const visibility = post.visibility || 'public'

  if (visibility === 'private' && !admin && !isAuthor) {
    return false
  }

  if (visibility === 'followers' && !admin && !isAuthor && !isFollowingAuthor) {
    return false
  }

  if (isPaidPost(post) && !admin && !canViewPaidPostContent(post, viewerId, hasUnlocked)) {
    return false
  }

  return true
}
