import { describe, expect, it } from 'vitest'
import {
  buildCreatorProfilePostsPayload,
  canCreatorBuyOwnPost,
  getAdultAccessState,
  getCreatorExclusivePostAccess,
  getExclusiveAccessState,
  getSafeProfileContentMode,
  isPublicCreatorProfilePost,
  prepareCreatorExclusivePosts,
  prepareCreatorPublicPosts,
  shouldRequestSignedUrlForCreatorPost,
} from '../../lib/creator-profile-access'

const adultViewer = {
  isMinor: false,
  wants18Plus: true,
  ageVerificationStatus: 'approved',
}

const unverifiedViewer = {
  isMinor: false,
  wants18Plus: false,
  ageVerificationStatus: 'not_started',
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    user_id: 'creator-1',
    content: 'conteudo completo',
    image_url: 'https://example.invalid/image.jpg',
    video_url: 'https://example.invalid/video.mp4',
    visibility: 'public',
    is_paid: false,
    price_itacash: null,
    paid_unlocked: false,
    community_type: 'general',
    content_rating: 'safe',
    category: 'daily',
    moderation_status: 'active',
    media: [{ id: 'media-1', media_url: 'https://example.invalid/media.jpg' }],
    ...overrides,
  }
}

describe('creator profile public and exclusive access', () => {
  it('keeps general profile public posts in the public area', () => {
    const posts = prepareCreatorPublicPosts([makePost()], { viewerId: null, viewerProfile: null })
    expect(posts).toHaveLength(1)
    expect(posts[0].content).toBe('conteudo completo')
  })

  it('does not show adult posts in the public area', () => {
    const adultPost = makePost({ community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    expect(prepareCreatorPublicPosts([adultPost], { viewerId: 'viewer-1', viewerProfile: adultViewer })).toEqual([])
  })

  it('blocks exclusive adult listing for signed out, minor, unverified, and opt-out users', () => {
    const adultPost = makePost({ community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    expect(prepareCreatorExclusivePosts([adultPost], { viewerId: null, viewerProfile: null })).toEqual([])
    expect(prepareCreatorExclusivePosts([adultPost], { viewerId: 'viewer-1', viewerProfile: { isMinor: true, wants18Plus: true, ageVerificationStatus: 'approved' } })).toEqual([])
    expect(prepareCreatorExclusivePosts([adultPost], { viewerId: 'viewer-1', viewerProfile: { isMinor: false, wants18Plus: true, ageVerificationStatus: 'pending' } })).toEqual([])
    expect(prepareCreatorExclusivePosts([adultPost], { viewerId: 'viewer-1', viewerProfile: { isMinor: false, wants18Plus: false, ageVerificationStatus: 'approved' } })).toEqual([])
  })

  it('lets authenticated users without 18+ verification list a safe paid card', () => {
    const paidPost = makePost({ is_paid: true, price_itacash: 15 })
    const posts = prepareCreatorExclusivePosts([paidPost], { viewerId: 'viewer-1', viewerProfile: unverifiedViewer })

    expect(posts).toHaveLength(1)
    expect(posts[0].content).toBeNull()
    expect(posts[0].media).toEqual([])
    expect(posts[0].price_itacash).toBe(15)
  })

  it('does not return adult posts to users without 18+ verification', () => {
    const adultPost = makePost({ community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    expect(prepareCreatorExclusivePosts([adultPost], { viewerId: 'viewer-1', viewerProfile: unverifiedViewer })).toEqual([])
  })

  it('allows authorized adults to list exclusive content', () => {
    const adultPost = makePost({ community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    const posts = prepareCreatorExclusivePosts([adultPost], { viewerId: 'viewer-1', viewerProfile: adultViewer })
    expect(posts).toHaveLength(1)
    expect(posts[0].content).toBe('conteudo completo')
  })

  it('keeps locked paid post text and protected media out of the client payload', () => {
    const paidPost = makePost({ is_paid: true, price_itacash: 15 })
    const posts = prepareCreatorExclusivePosts([paidPost], { viewerId: 'viewer-1', viewerProfile: adultViewer })
    expect(posts).toHaveLength(1)
    expect(posts[0].content).toBeNull()
    expect(posts[0].image_url).toBeNull()
    expect(posts[0].video_url).toBeNull()
    expect(posts[0].media).toEqual([])
    expect(posts[0].price_itacash).toBe(15)
  })

  it('shows unlocked safe paid content without requiring adult authorization', () => {
    const paidPost = makePost({ is_paid: true, price_itacash: 15, paid_unlocked: true })
    const posts = prepareCreatorExclusivePosts([paidPost], { viewerId: 'buyer-1', viewerProfile: unverifiedViewer })
    expect(posts[0].content).toBe('conteudo completo')
    expect(posts[0].media).toHaveLength(1)
  })

  it('requires adult authorization and paid unlock for adult paid content', () => {
    const paidAdultPost = makePost({ is_paid: true, price_itacash: 15, community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    const posts = prepareCreatorExclusivePosts([paidAdultPost], { viewerId: 'buyer-1', viewerProfile: adultViewer })

    expect(posts).toHaveLength(1)
    expect(posts[0].content).toBeNull()
    expect(posts[0].media).toEqual([])
    expect(getCreatorExclusivePostAccess(paidAdultPost, { viewerId: 'buyer-1', viewerProfile: adultViewer }).reason).toBe('paid_locked')
  })

  it('keeps adult paid content blocked when unlocked but adult authorization is missing', () => {
    const paidAdultPost = makePost({ is_paid: true, price_itacash: 15, paid_unlocked: true, community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    expect(prepareCreatorExclusivePosts([paidAdultPost], { viewerId: 'buyer-1', viewerProfile: unverifiedViewer })).toEqual([])
  })

  it('keeps adult paid content behind paywall when adult authorization exists without unlock', () => {
    const paidAdultPost = makePost({ is_paid: true, price_itacash: 15, community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    const access = getCreatorExclusivePostAccess(paidAdultPost, { viewerId: 'buyer-1', viewerProfile: adultViewer })

    expect(access.listable).toBe(true)
    expect(access.contentAllowed).toBe(false)
    expect(access.sanitizedPost.content).toBeNull()
    expect(access.sanitizedPost.media).toEqual([])
  })

  it('lets the creator view their own exclusive content but not buy it', () => {
    const paidAdultPost = makePost({ is_paid: true, price_itacash: 15, community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    const posts = prepareCreatorExclusivePosts([paidAdultPost], { viewerId: 'creator-1', viewerProfile: null, isAuthor: true })
    expect(posts[0].content).toBe('conteudo completo')
    expect(canCreatorBuyOwnPost(paidAdultPost, 'creator-1')).toBe(false)
  })

  it('does not request signed URLs before authorization', () => {
    const adultPost = makePost({ community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    expect(shouldRequestSignedUrlForCreatorPost(adultPost, { viewerId: null, viewerProfile: null })).toBe(false)
    expect(shouldRequestSignedUrlForCreatorPost(adultPost, { viewerId: 'viewer-1', viewerProfile: adultViewer })).toBe(true)
  })

  it('requests signed URLs only after every applicable adult and paid authorization', () => {
    const paidPost = makePost({ is_paid: true, price_itacash: 15 })
    const unlockedPaidPost = makePost({ is_paid: true, price_itacash: 15, paid_unlocked: true })
    const paidAdultPost = makePost({ is_paid: true, price_itacash: 15, paid_unlocked: true, community_type: 'adult_18plus', content_rating: 'adult_18plus' })

    expect(shouldRequestSignedUrlForCreatorPost(paidPost, { viewerId: 'buyer-1', viewerProfile: unverifiedViewer })).toBe(false)
    expect(shouldRequestSignedUrlForCreatorPost(unlockedPaidPost, { viewerId: 'buyer-1', viewerProfile: unverifiedViewer })).toBe(true)
    expect(shouldRequestSignedUrlForCreatorPost(paidAdultPost, { viewerId: 'buyer-1', viewerProfile: unverifiedViewer })).toBe(false)
    expect(shouldRequestSignedUrlForCreatorPost(paidAdultPost, { viewerId: 'buyer-1', viewerProfile: adultViewer })).toBe(true)
  })

  it('keeps mixed profile safe posts public and does not classify every post as adult', () => {
    expect(getSafeProfileContentMode('mixed')).toBe('mixed')
    expect(isPublicCreatorProfilePost(makePost())).toBe(true)
    expect(isPublicCreatorProfilePost(makePost({ community_type: 'adult_18plus', content_rating: 'adult_18plus' }))).toBe(false)
  })

  it('exposes safe exclusive gate states', () => {
    expect(getExclusiveAccessState({ viewerId: null, viewerProfile: null })).toBe('signed_out')
    expect(getExclusiveAccessState({ viewerId: 'viewer-1', viewerProfile: unverifiedViewer })).toBe('available')
    expect(getAdultAccessState({ viewerId: 'viewer-1', viewerProfile: { isMinor: true, wants18Plus: true, ageVerificationStatus: 'approved' } })).toBe('minor')
    expect(getAdultAccessState({ viewerId: 'viewer-1', viewerProfile: adultViewer })).toBe('authorized')
  })

  it('builds a public payload without adult or paid posts', () => {
    const safePost = makePost({ id: 'safe-post' })
    const adultPost = makePost({ id: 'adult-post', community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    const paidPost = makePost({ id: 'paid-post', is_paid: true, price_itacash: 20 })
    const payload = buildCreatorProfilePostsPayload({
      posts: [safePost, adultPost, paidPost],
      viewer: { viewerId: null, viewerProfile: null },
    })

    expect(payload.posts.map((post) => post.id)).toEqual(['safe-post'])
    expect(JSON.stringify(payload)).not.toContain('adult-post')
    expect(JSON.stringify(payload)).not.toContain('paid-post')
  })

  it('builds a signed-out exclusive payload without exclusive posts', () => {
    const paidPost = makePost({ id: 'paid-post', is_paid: true, price_itacash: 20 })
    const payload = buildCreatorProfilePostsPayload({
      posts: [paidPost],
      viewer: { viewerId: null, viewerProfile: null },
    })

    expect(payload.access).toBe('signed_out')
    expect(payload.posts).toEqual([])
  })

  it('sanitizes locked safe paid posts in the delivered payload', () => {
    const paidPost = makePost({
      id: 'paid-post',
      is_paid: true,
      price_itacash: 20,
      content: 'SEGREDO_PAGO',
      image_url: 'https://example.invalid/private.jpg',
      video_url: 'https://example.invalid/private.mp4',
    })
    const payload = buildCreatorProfilePostsPayload({
      posts: [paidPost],
      mediaByPost: {
        'paid-post': [{ id: 'media-private', media_url: 'https://example.invalid/private-media.jpg' }],
      },
      viewer: { viewerId: 'viewer-1', viewerProfile: unverifiedViewer },
    })

    expect(payload.posts).toHaveLength(1)
    expect(payload.posts[0]).toMatchObject({
      id: 'paid-post',
      content: null,
      image_url: null,
      video_url: null,
      media: [],
      price_itacash: 20,
    })
    expect(JSON.stringify(payload)).not.toContain('SEGREDO_PAGO')
    expect(JSON.stringify(payload)).not.toContain('private-media')
  })

  it('keeps financially unlocked adult posts absent without adult authorization in delivered payload', () => {
    const paidAdultPost = makePost({
      id: 'adult-paid',
      is_paid: true,
      price_itacash: 20,
      paid_unlocked: true,
      community_type: 'adult_18plus',
      content_rating: 'adult_18plus',
      content: 'SEGREDO_ADULTO',
    })
    const payload = buildCreatorProfilePostsPayload({
      posts: [paidAdultPost],
      unlockedPostIds: new Set(['adult-paid']),
      viewer: { viewerId: 'viewer-1', viewerProfile: unverifiedViewer },
    })

    expect(payload.posts).toEqual([])
    expect(JSON.stringify(payload)).not.toContain('SEGREDO_ADULTO')
  })

  it('returns adult authorized paid posts as safe paywall until unlocked', () => {
    const paidAdultPost = makePost({
      id: 'adult-paid',
      is_paid: true,
      price_itacash: 20,
      community_type: 'adult_18plus',
      content_rating: 'adult_18plus',
      content: 'SEGREDO_ADULTO_PAGO',
    })
    const payload = buildCreatorProfilePostsPayload({
      posts: [paidAdultPost],
      viewer: { viewerId: 'viewer-1', viewerProfile: adultViewer },
    })

    expect(payload.posts).toHaveLength(1)
    expect(payload.posts[0].content).toBeNull()
    expect(payload.posts[0].media).toEqual([])
    expect(JSON.stringify(payload)).not.toContain('SEGREDO_ADULTO_PAGO')
  })

  it('returns adult authorized and unlocked content in delivered payload', () => {
    const paidAdultPost = makePost({
      id: 'adult-paid',
      is_paid: true,
      price_itacash: 20,
      community_type: 'adult_18plus',
      content_rating: 'adult_18plus',
      content: 'CONTEUDO_AUTORIZADO',
    })
    const payload = buildCreatorProfilePostsPayload({
      posts: [paidAdultPost],
      unlockedPostIds: new Set(['adult-paid']),
      viewer: { viewerId: 'viewer-1', viewerProfile: adultViewer },
    })

    expect(payload.posts).toHaveLength(1)
    expect(payload.posts[0].content).toBe('CONTEUDO_AUTORIZADO')
  })

  it('filters reposts when the original post is not returned', () => {
    const adultPost = makePost({ id: 'adult-post', community_type: 'adult_18plus', content_rating: 'adult_18plus' })
    const payload = buildCreatorProfilePostsPayload({
      posts: [adultPost],
      reposts: [{ id: 'repost-1', post_id: 'adult-post', user_id: 'creator-1', created_at: '2026-07-11T12:00:00.000Z' }],
      viewer: { viewerId: 'viewer-1', viewerProfile: unverifiedViewer },
    })

    expect(payload.posts).toEqual([])
    expect(payload.reposts).toEqual([])
  })

  it('lets authors receive their own protected content without treating repost authorship as ownership', () => {
    const ownPost = makePost({ id: 'own-paid', user_id: 'creator-1', is_paid: true, price_itacash: 20 })
    const repostedPaidPost = makePost({ id: 'reposted-paid', user_id: 'other-creator', is_paid: true, price_itacash: 20, content: 'OTHER_SECRET' })
    const payload = buildCreatorProfilePostsPayload({
      posts: [ownPost, repostedPaidPost],
      reposts: [{ id: 'repost-1', post_id: 'reposted-paid', user_id: 'creator-1', created_at: '2026-07-11T12:00:00.000Z' }],
      viewer: { viewerId: 'creator-1', viewerProfile: unverifiedViewer },
    })

    expect(payload.posts.find((post) => post.id === 'own-paid')?.content).toBe('conteudo completo')
    expect(payload.posts.find((post) => post.id === 'reposted-paid')?.content).toBeNull()
    expect(JSON.stringify(payload)).not.toContain('OTHER_SECRET')
  })
})
