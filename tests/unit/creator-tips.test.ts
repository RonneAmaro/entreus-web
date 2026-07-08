import { describe, expect, it } from 'vitest'
import {
  getCreatorTipErrorMessage,
  normalizeCreatorTipRpcError,
  summarizeCreatorTips,
  validateCreatorTipPayload,
} from '../../lib/creator-tips'

const senderId = '11111111-1111-4111-8111-111111111111'
const receiverId = '22222222-2222-4222-8222-222222222222'
const postId = '33333333-3333-4333-8333-333333333333'

describe('creator tips helper', () => {
  it('accepts a valid integer tip payload', () => {
    const result = validateCreatorTipPayload({
      receiverUserId: receiverId,
      amount: '25',
      postId,
      message: 'Obrigado pelo conteudo',
      currentUserId: senderId,
      availableBalance: 50,
    })

    expect(result).toEqual({
      ok: true,
      value: {
        receiverUserId: receiverId,
        amount: 25,
        postId,
        message: 'Obrigado pelo conteudo',
      },
    })
  })

  it('rejects zero, negative and decimal amounts', () => {
    expect(validateCreatorTipPayload({ receiverUserId: receiverId, amount: 0, currentUserId: senderId }).ok).toBe(false)
    expect(validateCreatorTipPayload({ receiverUserId: receiverId, amount: -10, currentUserId: senderId }).ok).toBe(false)
    expect(validateCreatorTipPayload({ receiverUserId: receiverId, amount: '10.5', currentUserId: senderId }).ok).toBe(false)
  })

  it('rejects an amount above the known local balance', () => {
    expect(validateCreatorTipPayload({
      receiverUserId: receiverId,
      amount: 100,
      currentUserId: senderId,
      availableBalance: 99,
    })).toMatchObject({
      ok: false,
      reason: 'insufficient_balance',
      message: getCreatorTipErrorMessage('insufficient_balance'),
    })
  })

  it('rejects self tips and missing receivers', () => {
    expect(validateCreatorTipPayload({
      receiverUserId: senderId,
      amount: 10,
      currentUserId: senderId,
    })).toMatchObject({ ok: false, reason: 'self_tip' })

    expect(validateCreatorTipPayload({
      amount: 10,
      currentUserId: senderId,
    })).toMatchObject({ ok: false, reason: 'missing_receiver' })
  })

  it('normalizes database/RPC errors to safe user reasons', () => {
    expect(normalizeCreatorTipRpcError({ message: 'Insufficient ItaCash balance' })).toBe('insufficient_balance')
    expect(normalizeCreatorTipRpcError({ message: 'Invalid tip receiver' })).toBe('self_tip')
    expect(normalizeCreatorTipRpcError({ message: 'Could not find the function public.send_itacash_tip' })).toBe('rpc_unavailable')
  })

  it('summarizes received tips without exposing unnecessary metadata', () => {
    expect(summarizeCreatorTips([
      {
        id: 'tip-1',
        amount: 25,
        created_at: '2026-06-20T12:00:00.000Z',
        metadata: { sender_id: senderId, message: 'Valeu!' },
      },
      {
        id: 'tip-2',
        amount: 50,
        created_at: '2026-06-21T12:00:00.000Z',
        metadata: { sender_id: receiverId, hidden: 'ignored' },
      },
      {
        id: 'tip-ignored',
        amount: -5,
        created_at: '2026-06-22T12:00:00.000Z',
        metadata: {},
      },
    ], 1)).toEqual({
      totalReceived: 75,
      grossAmount: 75,
      platformFeeAmount: 0,
      countReceived: 2,
      recentTips: [
        {
          id: 'tip-2',
          amount: 50,
          grossAmount: 50,
          platformFeeAmount: 0,
          createdAt: '2026-06-21T12:00:00.000Z',
          senderId: receiverId,
          message: null,
        },
      ],
    })
  })

  it('keeps creator tip summaries net when revenue split metadata is present', () => {
    expect(summarizeCreatorTips([
      {
        id: 'tip-net',
        amount: 85,
        created_at: '2026-06-22T12:00:00.000Z',
        metadata: {
          sender_id: senderId,
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
      countReceived: 1,
      recentTips: [
        {
          id: 'tip-net',
          amount: 85,
          grossAmount: 100,
          platformFeeAmount: 15,
        },
      ],
    })
  })
})
