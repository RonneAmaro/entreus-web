export const COMMUNITY_BADGE_SLUG = 'community'
export const COMMUNITY_BADGE_MIN_SCORE = 100
export const COMMUNITY_BADGE_INITIAL_VALIDITY_DAYS = 45

export const COMMUNITY_BADGE_SCORE_RULES = {
  postPublished: 3,
  commentMade: 2,
  likeReceived: 1,
  commentReceived: 2,
  repostReceived: 3,
  activeDay: 4,
  hiddenPostPenalty: -20,
} as const

export type CommunityBadgeMetrics = {
  postsPublished: number
  commentsMade: number
  likesReceived: number
  commentsReceived: number
  repostsReceived: number
  hiddenPosts: number
  activeDays: number
}

export function getCommunityBadgeScore(metrics: CommunityBadgeMetrics) {
  return (
    metrics.postsPublished * COMMUNITY_BADGE_SCORE_RULES.postPublished +
    metrics.commentsMade * COMMUNITY_BADGE_SCORE_RULES.commentMade +
    metrics.likesReceived * COMMUNITY_BADGE_SCORE_RULES.likeReceived +
    metrics.commentsReceived * COMMUNITY_BADGE_SCORE_RULES.commentReceived +
    metrics.repostsReceived * COMMUNITY_BADGE_SCORE_RULES.repostReceived +
    metrics.activeDays * COMMUNITY_BADGE_SCORE_RULES.activeDay +
    metrics.hiddenPosts * COMMUNITY_BADGE_SCORE_RULES.hiddenPostPenalty
  )
}

export function isCommunityBadgeEligible(score: number) {
  return score >= COMMUNITY_BADGE_MIN_SCORE
}
