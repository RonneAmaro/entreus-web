import { describe, expect, it } from 'vitest'
import {
  calculateCreatorEngagementRate,
  orderCreatorPosts,
  summarizeCreatorDashboard,
} from '../../lib/creator-dashboard'

const posts = [
  { id: 'post-1', created_at: '2026-06-01T12:00:00.000Z', community_type: 'general', content_rating: 'safe' },
  { id: 'post-2', created_at: '2026-06-03T12:00:00.000Z', community_type: 'sports', content_rating: 'sensitive' },
  { id: 'post-3', created_at: '2026-06-02T12:00:00.000Z', category: '18plus', moderation_status: 'hidden' },
]

describe('creator dashboard helper', () => {
  it('keeps engagement unavailable when views are zero', () => {
    expect(calculateCreatorEngagementRate({ likes: 10, comments: 4, views: 0 })).toEqual({
      value: 0,
      available: false,
    })
  })

  it('calculates a simple engagement rate from received interactions and views', () => {
    expect(calculateCreatorEngagementRate({ likes: 10, comments: 5, reposts: 3, saves: 2, views: 100 })).toEqual({
      value: 20,
      available: true,
    })
  })

  it('uses an unavailable fallback when an optional metric source is absent', () => {
    const summary = summarizeCreatorDashboard({ posts })

    expect(summary.likes).toEqual({ value: 0, available: false })
    expect(summary.followers).toEqual({ value: 0, available: false })
    expect(summary.posts).toBe(3)
  })

  it('aggregates posts by community and treats legacy adult categories as adult', () => {
    const summary = summarizeCreatorDashboard({ posts, likesReceived: 0, commentsReceived: 0, repostsReceived: 0, savesReceived: 0 })

    expect(summary.communities.general).toBe(1)
    expect(summary.communities.sports).toBe(1)
    expect(summary.communities.adult_18plus).toBe(1)
  })

  it('aggregates posts by content rating and flags moderated posts', () => {
    const summary = summarizeCreatorDashboard({ posts, likesReceived: 0, commentsReceived: 0, repostsReceived: 0, savesReceived: 0 })

    expect(summary.ratings.safe).toBe(1)
    expect(summary.ratings.sensitive).toBe(1)
    expect(summary.ratings.adult_18plus).toBe(1)
    expect(summary.hiddenPosts).toBe(1)
  })

  it('orders recent and top posts without post content or media', () => {
    expect(orderCreatorPosts(posts, { 'post-1': 2, 'post-2': 9, 'post-3': 4 }, 'recent').map((post) => post.id)).toEqual([
      'post-2', 'post-3', 'post-1',
    ])
    expect(orderCreatorPosts(posts, { 'post-1': 2, 'post-2': 9, 'post-3': 4 }, 'engagement').map((post) => post.id)).toEqual([
      'post-2', 'post-3', 'post-1',
    ])
    expect(orderCreatorPosts(posts, { 'post-2': 9 }, 'engagement')[0]).not.toHaveProperty('content')
  })

  it('keeps creator dashboard support totals as net creator income', () => {
    const summary = summarizeCreatorDashboard({
      posts: [],
      supportsReceived: 85,
      walletBalance: 85,
    })

    expect(summary.supports).toEqual({ value: 85, available: true })
    expect(summary.walletBalance).toEqual({ value: 85, available: true })
  })
})
