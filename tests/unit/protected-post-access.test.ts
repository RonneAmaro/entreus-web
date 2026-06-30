import { describe, expect, it } from 'vitest'
import {
  evaluateProtectedPostAccess,
  protectPostForViewer,
  sanitizeProtectedPostContent,
} from '../../lib/protected-post-access'

const adultViewer = {
  isMinor: false,
  wants18Plus: true,
  ageVerificationStatus: 'approved',
}

const blockedViewer = {
  isMinor: false,
  wants18Plus: false,
  ageVerificationStatus: 'not_started',
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    user_id: 'author-1',
    content: 'protected content',
    image_url: 'https://example.com/image.jpg',
    video_url: 'https://example.com/video.mp4',
    media_url: 'https://example.com/legacy.jpg',
    preview_url: 'https://example.com/preview.jpg',
    thumbnail_url: 'https://example.com/thumb.jpg',
    visibility: 'public',
    is_paid: false,
    price_itacash: null,
    paid_unlocked: false,
    community_type: 'general',
    content_rating: 'safe',
    category: 'daily',
    moderation_status: 'active',
    media: [
      {
        id: 'media-1',
        media_url: 'https://example.com/media.jpg',
        storage_key: 'posts/author-1/media.jpg',
      },
    ],
    ...overrides,
  }
}

describe('protected post access', () => {
  it('keeps safe public post content available', () => {
    const post = protectPostForViewer({
      post: makePost(),
      viewerId: 'viewer-1',
      viewerProfile: blockedViewer,
    })

    expect(post.content).toBe('protected content')
    expect(post.image_url).toContain('image.jpg')
    expect(post.media).toHaveLength(1)
  })

  it('blocks adult content for logged out, minor, or unverified viewers', () => {
    const post = protectPostForViewer({
      post: makePost({ community_type: 'adult_18plus', content_rating: 'adult_18plus' }),
      viewerId: null,
      viewerProfile: null,
    })

    expect(post.content).toBeNull()
    expect(post.image_url).toBeNull()
    expect(post.video_url).toBeNull()
    expect(post.media).toEqual([])
  })

  it('allows adult content for verified opted-in adults', () => {
    const post = protectPostForViewer({
      post: makePost({ community_type: 'adult_18plus', content_rating: 'adult_18plus' }),
      viewerId: 'viewer-1',
      viewerProfile: adultViewer,
    })

    expect(post.content).toBe('protected content')
    expect(post.media).toHaveLength(1)
  })

  it('removes content and media from locked paid posts', () => {
    const post = protectPostForViewer({
      post: makePost({ is_paid: true, price_itacash: 25 }),
      viewerId: 'viewer-1',
      viewerProfile: adultViewer,
      hasPaidUnlock: false,
    })

    expect(post.content).toBeNull()
    expect(post.image_url).toBeNull()
    expect(post.video_url).toBeNull()
    expect(post.media_url).toBeNull()
    expect(post.preview_url).toBeNull()
    expect(post.thumbnail_url).toBeNull()
    expect(post.media).toEqual([])
    expect(post.is_paid).toBe(true)
    expect(post.price_itacash).toBe(25)
    expect(post.paid_unlocked).toBe(false)
  })

  it('keeps paid content after unlock', () => {
    const post = protectPostForViewer({
      post: makePost({ is_paid: true, price_itacash: 25 }),
      viewerId: 'viewer-1',
      viewerProfile: adultViewer,
      hasPaidUnlock: true,
    })

    expect(post.content).toBe('protected content')
    expect(post.media).toHaveLength(1)
    expect(post.paid_unlocked).toBe(true)
  })

  it('allows the author to see their own post', () => {
    const post = protectPostForViewer({
      post: makePost({
        is_paid: true,
        price_itacash: 25,
        community_type: 'adult_18plus',
        content_rating: 'adult_18plus',
        visibility: 'private',
      }),
      viewerId: 'author-1',
      viewerProfile: blockedViewer,
      hasPaidUnlock: false,
    })

    expect(post.content).toBe('protected content')
    expect(post.media).toHaveLength(1)
  })

  it('allows admins to see protected posts', () => {
    const decision = evaluateProtectedPostAccess({
      post: makePost({
        is_paid: true,
        price_itacash: 25,
        community_type: 'adult_18plus',
        content_rating: 'adult_18plus',
        visibility: 'private',
      }),
      viewerId: 'admin-1',
      viewerProfile: null,
      isAdmin: true,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBe('allowed')
  })

  it('blocks private posts for unauthorized viewers', () => {
    const post = protectPostForViewer({
      post: makePost({ visibility: 'private' }),
      viewerId: 'viewer-1',
      viewerProfile: adultViewer,
    })

    expect(post.content).toBeNull()
    expect(post.media).toEqual([])
  })

  it('blocks followers-only posts for non-followers', () => {
    const decision = evaluateProtectedPostAccess({
      post: makePost({ visibility: 'followers' }),
      viewerId: 'viewer-1',
      viewerProfile: adultViewer,
      isFollowingAuthor: false,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('visibility')
  })

  it('keeps saved-list blocked posts sanitized', () => {
    const savedPost = protectPostForViewer({
      post: makePost({ is_paid: true, price_itacash: 50 }),
      viewerId: 'viewer-1',
      viewerProfile: adultViewer,
      hasPaidUnlock: false,
      canViewVisibility: true,
    })

    expect(savedPost.content).toBeNull()
    expect(savedPost.media).toEqual([])
    expect(savedPost.id).toBe('post-1')
    expect(savedPost.price_itacash).toBe(50)
  })

  it('sanitizes moderation-hidden posts before other checks', () => {
    const decision = evaluateProtectedPostAccess({
      post: makePost({
        moderation_status: 'hidden',
        is_paid: true,
        price_itacash: 25,
      }),
      viewerId: 'viewer-1',
      viewerProfile: adultViewer,
      hasPaidUnlock: true,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('moderation')
    expect(sanitizeProtectedPostContent(makePost()).content).toBeNull()
  })
})
