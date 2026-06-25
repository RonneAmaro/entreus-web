import { describe, expect, it } from 'vitest'
import {
  calculatePostEngagementRate,
  canCountPostView,
  rankPostsByEngagement,
  rankPostsByViews,
  sanitizePostViewSource,
  summarizePostViewRows,
  validatePostViewPayload,
  type PostAnalyticsPost,
} from '../../lib/post-analytics'

const postId = '11111111-1111-4111-8111-111111111111'
const viewerId = '22222222-2222-4222-8222-222222222222'
const creatorId = '33333333-3333-4333-8333-333333333333'

const adultViewer = {
  isMinor: false,
  wants18Plus: true,
  ageVerificationStatus: 'approved',
}

const safePost: PostAnalyticsPost = {
  id: postId,
  user_id: creatorId,
  created_at: '2026-06-25T12:00:00.000Z',
  visibility: 'public',
  moderation_status: 'active',
  is_paid: false,
  price_itacash: null,
}

describe('post analytics helpers', () => {
  it('validates post view payloads and normalizes sources', () => {
    expect(sanitizePostViewSource(' Profile ')).toBe('profile')
    expect(sanitizePostViewSource('timeline')).toBe('unknown')

    expect(validatePostViewPayload({ postId, source: 'feed' })).toEqual({
      ok: true,
      value: { postId, source: 'feed' },
    })

    expect(validatePostViewPayload({ postId: '' })).toMatchObject({
      ok: false,
      reason: 'missing_post',
    })

    expect(validatePostViewPayload({ postId: 'not-a-uuid' })).toMatchObject({
      ok: false,
      reason: 'invalid_post',
    })
  })

  it('summarizes views without depending on real Supabase rows', () => {
    const summary = summarizePostViewRows([
      { post_id: 'post-1', created_at: '2026-06-25T10:00:00.000Z' },
      { post_id: 'post-1', created_at: '2026-06-20T10:00:00.000Z' },
      { post_id: 'post-2', created_at: '2026-06-01T10:00:00.000Z' },
      { post_id: 'post-2', created_at: '2026-05-01T10:00:00.000Z' },
      { post_id: null, created_at: '2026-06-25T10:00:00.000Z' },
    ], new Date('2026-06-25T12:00:00.000Z'))

    expect(summary.total).toBe(5)
    expect(summary.last7).toBe(3)
    expect(summary.last30).toBe(4)
    expect(summary.viewsByPostId).toEqual({ 'post-1': 2, 'post-2': 2 })
  })

  it('calculates engagement only when views are available', () => {
    expect(calculatePostEngagementRate(12, 100)).toEqual({ value: 12, available: true })
    expect(calculatePostEngagementRate(12, 0)).toEqual({ value: 0, available: false })
  })

  it('ranks posts by views and engagement without exposing content', () => {
    const posts: PostAnalyticsPost[] = [
      { ...safePost, id: 'post-1', created_at: '2026-06-01T12:00:00.000Z' },
      { ...safePost, id: 'post-2', created_at: '2026-06-03T12:00:00.000Z' },
      { ...safePost, id: 'post-3', created_at: '2026-06-02T12:00:00.000Z' },
    ]

    expect(rankPostsByViews(posts, { 'post-1': 4, 'post-2': 10, 'post-3': 10 }, {}, 2).map((post) => post.id)).toEqual([
      'post-2',
      'post-3',
    ])

    expect(rankPostsByEngagement(posts, { 'post-1': 100, 'post-2': 20 }, { 'post-1': 5, 'post-2': 4 }, 2).map((post) => post.id)).toEqual([
      'post-2',
      'post-1',
    ])

    expect(rankPostsByViews(posts, { 'post-1': 1 }, {}, 1)[0]).not.toHaveProperty('content')
  })

  it('blocks analytics for unavailable paid, adult, private, follower-only or hidden posts', () => {
    expect(canCountPostView({ post: safePost, viewerId, viewer: null })).toBe(true)
    expect(canCountPostView({ post: { ...safePost, visibility: 'private' }, viewerId, viewer: null })).toBe(false)
    expect(canCountPostView({ post: { ...safePost, visibility: 'private' }, viewerId: creatorId, viewer: null })).toBe(true)
    expect(canCountPostView({ post: { ...safePost, visibility: 'followers' }, viewerId, viewer: null })).toBe(false)
    expect(canCountPostView({ post: { ...safePost, visibility: 'followers' }, viewerId, viewer: null, isFollowingAuthor: true })).toBe(true)
    expect(canCountPostView({ post: { ...safePost, moderation_status: 'hidden' }, viewerId, viewer: null })).toBe(false)

    expect(canCountPostView({
      post: { ...safePost, is_paid: true, price_itacash: 25, paid_unlocked: false },
      viewerId,
      viewer: null,
    })).toBe(false)

    expect(canCountPostView({
      post: { ...safePost, is_paid: true, price_itacash: 25 },
      viewerId,
      viewer: null,
      hasUnlocked: true,
    })).toBe(true)

    expect(canCountPostView({
      post: { ...safePost, community_type: 'adult_18plus', content_rating: 'adult_18plus' },
      viewerId,
      viewer: null,
    })).toBe(false)

    expect(canCountPostView({
      post: { ...safePost, community_type: 'adult_18plus', content_rating: 'adult_18plus' },
      viewerId,
      viewer: adultViewer,
    })).toBe(true)
  })
})
