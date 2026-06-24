import { isAdultPost, isLegacyAdultCategory } from './content-access'
import {
  getSafePostCommunity,
  getSafePostContentRating,
  type PostCommunityType,
  type PostContentRating,
} from './post-classification-types'

export type CreatorDashboardPost = {
  id: string
  created_at: string
  community_type?: unknown
  content_rating?: unknown
  category?: unknown
  moderation_status?: string | null
}

export type CreatorMetric = {
  value: number
  available: boolean
}

export type CreatorPostSummary = {
  id: string
  createdAt: string
  community: PostCommunityType
  rating: PostContentRating
  moderationStatus: string
  engagement: number
}

export type CreatorDashboardSummary = {
  posts: number
  communities: Record<PostCommunityType, number>
  ratings: Record<PostContentRating, number>
  hiddenPosts: number
  lastActivityAt: string | null
  likes: CreatorMetric
  comments: CreatorMetric
  reposts: CreatorMetric
  saves: CreatorMetric
  followers: CreatorMetric
  supports: CreatorMetric
  walletBalance: CreatorMetric
  interactions: CreatorMetric
  engagementRate: CreatorMetric
  recentPosts: CreatorPostSummary[]
  topPosts: CreatorPostSummary[]
}

export type CreatorDashboardInput = {
  posts: CreatorDashboardPost[]
  likesReceived?: number | null
  commentsReceived?: number | null
  repostsReceived?: number | null
  savesReceived?: number | null
  followers?: number | null
  supportsReceived?: number | null
  walletBalance?: number | null
  views?: number | null
  interactionsByPostId?: Record<string, number>
}

const COMMUNITIES: PostCommunityType[] = [
  'general',
  'sports',
  'geopolitics',
  'military',
  'adult_18plus',
]

const RATINGS: PostContentRating[] = ['safe', 'sensitive', 'adult_18plus']

function numberOrNull(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.floor(value))
}

function metric(value: unknown): CreatorMetric {
  const normalized = numberOrNull(value)
  return normalized === null
    ? { value: 0, available: false }
    : { value: normalized, available: true }
}

function emptyCommunities() {
  return Object.fromEntries(COMMUNITIES.map((community) => [community, 0])) as Record<PostCommunityType, number>
}

function emptyRatings() {
  return Object.fromEntries(RATINGS.map((rating) => [rating, 0])) as Record<PostContentRating, number>
}

export function normalizeCreatorNumber(value: unknown, fallback = 0) {
  const normalized = numberOrNull(value)
  return normalized === null ? fallback : normalized
}

/**
 * A percentage is meaningful only with a real view count. Returning an
 * unavailable metric avoids turning missing analytics into an apparent 0%.
 */
export function calculateCreatorEngagementRate(input: {
  likes?: number | null
  comments?: number | null
  reposts?: number | null
  saves?: number | null
  views?: number | null
}): CreatorMetric {
  const views = numberOrNull(input.views)
  if (views === null || views === 0) return { value: 0, available: false }

  const interactions = [input.likes, input.comments, input.reposts, input.saves]
    .reduce<number>((total, value) => total + normalizeCreatorNumber(value), 0)

  return {
    value: Math.round((interactions / views) * 10_000) / 100,
    available: true,
  }
}

function toPostSummary(
  post: CreatorDashboardPost,
  interactionsByPostId: Record<string, number>,
): CreatorPostSummary {
  const adult = isAdultPost(post) || isLegacyAdultCategory(post.category)
  const community = adult ? 'adult_18plus' : getSafePostCommunity(post.community_type)
  const rating = adult ? 'adult_18plus' : getSafePostContentRating(post.content_rating)

  return {
    id: post.id,
    createdAt: post.created_at,
    community,
    rating,
    moderationStatus: post.moderation_status || 'active',
    engagement: normalizeCreatorNumber(interactionsByPostId[post.id]),
  }
}

export function orderCreatorPosts(
  posts: CreatorDashboardPost[],
  interactionsByPostId: Record<string, number> = {},
  order: 'recent' | 'engagement' = 'recent',
  limit = 5,
) {
  const summaries = posts.map((post) => toPostSummary(post, interactionsByPostId))

  return summaries
    .sort((left, right) => {
      if (order === 'engagement' && right.engagement !== left.engagement) {
        return right.engagement - left.engagement
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
    .slice(0, Math.max(0, limit))
}

export function summarizeCreatorDashboard(input: CreatorDashboardInput): CreatorDashboardSummary {
  const communities = emptyCommunities()
  const ratings = emptyRatings()
  const interactionsByPostId = input.interactionsByPostId || {}

  let hiddenPosts = 0

  for (const post of input.posts) {
    const summary = toPostSummary(post, interactionsByPostId)
    communities[summary.community] += 1
    ratings[summary.rating] += 1
    if (summary.moderationStatus !== 'active') hiddenPosts += 1
  }

  const likes = metric(input.likesReceived)
  const comments = metric(input.commentsReceived)
  const reposts = metric(input.repostsReceived)
  const saves = metric(input.savesReceived)
  const followers = metric(input.followers)
  const supports = metric(input.supportsReceived)
  const walletBalance = metric(input.walletBalance)
  const interactionSources = [likes, comments, reposts, saves]
  const interactionsAvailable = interactionSources.every((source) => source.available)
  const interactions: CreatorMetric = {
    value: interactionSources.reduce((total, source) => total + source.value, 0),
    available: interactionsAvailable,
  }

  return {
    posts: input.posts.length,
    communities,
    ratings,
    hiddenPosts,
    lastActivityAt: orderCreatorPosts(input.posts, interactionsByPostId, 'recent', 1)[0]?.createdAt || null,
    likes,
    comments,
    reposts,
    saves,
    followers,
    supports,
    walletBalance,
    interactions,
    engagementRate: calculateCreatorEngagementRate({
      likes: input.likesReceived,
      comments: input.commentsReceived,
      reposts: input.repostsReceived,
      saves: input.savesReceived,
      views: input.views,
    }),
    recentPosts: orderCreatorPosts(input.posts, interactionsByPostId, 'recent'),
    topPosts: orderCreatorPosts(input.posts, interactionsByPostId, 'engagement', 3),
  }
}
