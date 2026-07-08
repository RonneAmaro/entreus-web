import { describe, expect, it } from 'vitest'
import {
  canRenderPaidPostContent,
  getPaidPostBlockedReason,
  getPaidPostErrorMessage,
  normalizePaidPostRpcError,
  sanitizeLockedPaidPostForClient,
  summarizePaidPostUnlocks,
  validatePaidPostPrice,
  validatePaidPostUnlockPayload,
} from '../../lib/paid-posts'

const authorId = '11111111-1111-4111-8111-111111111111'
const buyerId = '22222222-2222-4222-8222-222222222222'
const postId = '33333333-3333-4333-8333-333333333333'

const adultViewer = {
  isMinor: false,
  wants18Plus: true,
  ageVerificationStatus: 'approved',
}

describe('paid posts helper', () => {
  it('accepts only positive integer ItaCash prices', () => {
    expect(validatePaidPostPrice('25')).toEqual({ ok: true, value: 25 })
    expect(validatePaidPostPrice(1)).toEqual({ ok: true, value: 1 })
    expect(validatePaidPostPrice(0)).toMatchObject({ ok: false, reason: 'invalid_price' })
    expect(validatePaidPostPrice(-1)).toMatchObject({ ok: false, reason: 'invalid_price' })
    expect(validatePaidPostPrice('10.5')).toMatchObject({ ok: false, reason: 'invalid_price' })
  })

  it('does not block free posts', () => {
    expect(canRenderPaidPostContent({
      viewerId: buyerId,
      viewer: adultViewer,
      post: { id: postId, user_id: authorId, is_paid: false, price_itacash: null },
    })).toBe(true)
  })

  it('lets authors and unlocked buyers view paid posts', () => {
    const post = { id: postId, user_id: authorId, is_paid: true, price_itacash: 10 }

    expect(canRenderPaidPostContent({ viewerId: authorId, viewer: adultViewer, post })).toBe(true)
    expect(canRenderPaidPostContent({ viewerId: buyerId, viewer: adultViewer, post, hasUnlocked: true })).toBe(true)
  })

  it('blocks locked paid posts without exposing adult content first', () => {
    const post = { id: postId, user_id: authorId, is_paid: true, price_itacash: 10 }

    expect(getPaidPostBlockedReason({ viewerId: buyerId, viewer: adultViewer, post })).toBe('locked')
    expect(getPaidPostBlockedReason({
      viewerId: buyerId,
      viewer: { isMinor: true, wants18Plus: false, ageVerificationStatus: 'pending' },
      post: { ...post, community_type: 'adult_18plus', content_rating: 'adult_18plus' },
    })).toBe('adult_blocked')
  })

  it('sanitizes locked paid post content before rendering in the client', () => {
    const lockedPost = sanitizeLockedPaidPostForClient({
      id: postId,
      user_id: authorId,
      is_paid: true,
      price_itacash: 10,
      paid_unlocked: false,
      content: 'conteudo pago completo',
      image_url: 'https://example.com/image.jpg',
      video_url: 'https://example.com/video.mp4',
      media: [{ id: 'media-1' }],
    }, buyerId, false)

    expect(lockedPost).toMatchObject({
      content: null,
      image_url: null,
      video_url: null,
      media: [],
    })

    const unlockedPost = sanitizeLockedPaidPostForClient({
      id: postId,
      user_id: authorId,
      is_paid: true,
      price_itacash: 10,
      content: 'conteudo pago completo',
    }, buyerId, true)

    expect(unlockedPost.content).toBe('conteudo pago completo')
  })

  it('validates unlock payloads safely', () => {
    expect(validatePaidPostUnlockPayload({ postId })).toEqual({ ok: true, value: { postId } })
    expect(validatePaidPostUnlockPayload({ postId: '' })).toMatchObject({ ok: false, reason: 'missing_post' })
    expect(validatePaidPostUnlockPayload({ postId: 'not-a-uuid' })).toMatchObject({ ok: false, reason: 'invalid_post' })
  })

  it('normalizes RPC errors to safe reasons', () => {
    expect(normalizePaidPostRpcError({ message: 'Insufficient ItaCash balance' })).toBe('insufficient_balance')
    expect(normalizePaidPostRpcError({ message: 'Cannot unlock own post' })).toBe('self_unlock')
    expect(normalizePaidPostRpcError({ message: 'Could not find the function public.unlock_paid_post' })).toBe('unlock_unavailable')
    expect(getPaidPostErrorMessage('locked')).toBe('Desbloqueie este post para ver o conteudo.')
  })

  it('summarizes creator paid post unlock income', () => {
    expect(summarizePaidPostUnlocks([
      {
        id: 'unlock-1',
        amount: 25,
        created_at: '2026-06-20T12:00:00.000Z',
        metadata: { buyer_id: buyerId, post_id: postId },
      },
      {
        id: 'ignored',
        amount: -5,
        created_at: '2026-06-21T12:00:00.000Z',
        metadata: { buyer_id: buyerId, post_id: postId },
      },
    ])).toMatchObject({
      totalReceived: 25,
      unlockCount: 1,
      recentUnlocks: [
        {
          id: 'unlock-1',
          amount: 25,
          grossAmount: 25,
          platformFeeAmount: 0,
          buyerId,
          postId,
        },
      ],
      topPosts: [
        {
          postId,
          unlocks: 1,
          total: 25,
        },
      ],
    })
  })

  it('keeps paid post income net when revenue split metadata is present', () => {
    expect(summarizePaidPostUnlocks([
      {
        id: 'unlock-net',
        amount: 85,
        created_at: '2026-06-22T12:00:00.000Z',
        metadata: {
          buyer_id: buyerId,
          post_id: postId,
          gross_amount: 100,
          creator_amount: 85,
          platform_fee_amount: 15,
          platform_fee_bps: 1500,
        },
      },
    ])).toMatchObject({
      totalReceived: 85,
      grossAmount: 100,
      platformFeeAmount: 15,
      unlockCount: 1,
      recentUnlocks: [
        {
          id: 'unlock-net',
          amount: 85,
          grossAmount: 100,
          platformFeeAmount: 15,
          buyerId,
          postId,
        },
      ],
    })
  })
})
