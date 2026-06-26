import { describe, expect, it } from 'vitest'

import { authorizePostForViewer, type ProtectedPostLike } from '../../lib/protected-post-access'

const basePost: ProtectedPostLike = {
  id: 'post-1',
  user_id: 'author-1',
  content: 'conteudo protegido',
  image_url: 'https://example.com/image.jpg',
  video_url: 'https://example.com/video.mp4',
  visibility: 'public',
  category: 'cotidiano',
  community_type: 'general',
  content_rating: 'safe',
  is_paid: false,
  price_itacash: null,
  media: [
    {
      id: 'media-1',
      post_id: 'post-1',
      media_url: 'https://example.com/media.jpg',
      media_type: 'image',
      access_level: 'public',
    },
  ],
}

const adultViewer = {
  userId: 'viewer-1',
  profile: {
    isMinor: false,
    wants18Plus: true,
    ageVerificationStatus: 'approved',
  },
}

describe('protected post access', () => {
  it('allows public safe posts', () => {
    const result = authorizePostForViewer(basePost, { userId: 'viewer-1' }, 'public-list')

    expect(result.reason).toBe('allowed')
    expect(result.post?.content).toBe('conteudo protegido')
    expect(result.post?.media?.[0]?.media_url).toBe('https://example.com/media.jpg')
  })

  it('allows followers-only posts for followers', () => {
    const result = authorizePostForViewer(
      { ...basePost, visibility: 'followers' },
      { userId: 'viewer-1', followingUserIds: ['author-1'] },
      'public-list',
    )

    expect(result.visible).toBe(true)
    expect(result.contentAllowed).toBe(true)
  })

  it('does not return private post content to another user', () => {
    const result = authorizePostForViewer(
      { ...basePost, visibility: 'private' },
      { userId: 'viewer-1' },
      'post-detail',
    )

    expect(result.visible).toBe(false)
    expect(result.reason).toBe('visibility')
    expect(result.post).toBeNull()
  })

  it('sanitizes adult content before visibility and paywall content is returned', () => {
    const result = authorizePostForViewer(
      { ...basePost, community_type: 'adult_18plus', content_rating: 'adult_18plus' },
      { userId: 'viewer-1', profile: { isMinor: false, wants18Plus: false, ageVerificationStatus: 'approved' } },
      'post-detail',
    )

    expect(result.reason).toBe('adult')
    expect(result.post?.content).toBeNull()
    expect(result.post?.image_url).toBeNull()
    expect(result.post?.video_url).toBeNull()
    expect(result.post?.media).toEqual([])
  })

  it('sanitizes locked paid posts', () => {
    const result = authorizePostForViewer(
      { ...basePost, is_paid: true, price_itacash: 25, paid_unlocked: false },
      { userId: 'viewer-1' },
      'post-detail',
    )

    expect(result.reason).toBe('paywall')
    expect(result.post?.content).toBeNull()
    expect(result.post?.media).toEqual([])
  })

  it('allows unlocked paid posts', () => {
    const result = authorizePostForViewer(
      { ...basePost, is_paid: true, price_itacash: 25, paid_unlocked: false },
      { userId: 'viewer-1', unlockedPostIds: ['post-1'] },
      'post-detail',
    )

    expect(result.reason).toBe('allowed')
    expect(result.post?.paid_unlocked).toBe(true)
    expect(result.post?.content).toBe('conteudo protegido')
  })

  it('allows admins through moderation, adult, visibility and paywall checks', () => {
    const result = authorizePostForViewer(
      {
        ...basePost,
        visibility: 'private',
        community_type: 'adult_18plus',
        content_rating: 'adult_18plus',
        moderation_status: 'hidden',
        is_paid: true,
        price_itacash: 25,
      },
      { userId: 'admin-1', isAdmin: true },
      'admin',
    )

    expect(result.reason).toBe('allowed')
    expect(result.post?.content).toBe('conteudo protegido')
  })

  it('allows authors to read their own paid and private posts', () => {
    const result = authorizePostForViewer(
      { ...basePost, visibility: 'private', is_paid: true, price_itacash: 25 },
      adultViewer,
      'post-detail',
    )
    const authorResult = authorizePostForViewer(
      { ...basePost, visibility: 'private', is_paid: true, price_itacash: 25 },
      { ...adultViewer, userId: 'author-1' },
      'post-detail',
    )

    expect(result.reason).toBe('visibility')
    expect(authorResult.reason).toBe('allowed')
    expect(authorResult.post?.content).toBe('conteudo protegido')
  })
})
