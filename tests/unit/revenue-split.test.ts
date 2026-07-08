import { describe, expect, it } from 'vitest'
import {
  BPS_DENOMINATOR,
  CREATOR_SHARE_BPS,
  PLATFORM_FEE_BPS,
  calculateRevenueSplit,
  createRevenueSplitMetadata,
  getRevenueSplitBreakdown,
} from '../../lib/revenue-split'

describe('revenue split helper', () => {
  it.each([
    [100, 85, 15],
    [50, 43, 7],
    [25, 22, 3],
    [10, 9, 1],
    [1, 1, 0],
  ])('splits %i ItaCash into creator %i and platform %i', (gross, creator, platform) => {
    expect(calculateRevenueSplit(gross)).toMatchObject({
      grossAmount: gross,
      creatorAmount: creator,
      platformFeeAmount: platform,
      platformFeeBps: PLATFORM_FEE_BPS,
      creatorShareBps: CREATOR_SHARE_BPS,
    })
  })

  it('rejects zero, negative and decimal amounts', () => {
    expect(() => calculateRevenueSplit(0)).toThrow(RangeError)
    expect(() => calculateRevenueSplit(-1)).toThrow(RangeError)
    expect(() => calculateRevenueSplit(10.5)).toThrow(RangeError)
  })

  it('keeps the gross amount equal to creator plus platform', () => {
    const split = calculateRevenueSplit(999)

    expect(split.creatorAmount + split.platformFeeAmount).toBe(split.grossAmount)
  })

  it('builds metadata expected by RPC transactions and ledgers', () => {
    expect(createRevenueSplitMetadata(calculateRevenueSplit(100))).toEqual({
      gross_amount: 100,
      creator_amount: 85,
      platform_fee_amount: 15,
      platform_fee_bps: PLATFORM_FEE_BPS,
      creator_share_bps: CREATOR_SHARE_BPS,
    })
  })

  it('reads valid metadata without turning gross into creator income', () => {
    expect(getRevenueSplitBreakdown({
      gross_amount: 100,
      creator_amount: 85,
      platform_fee_amount: 15,
      platform_fee_bps: PLATFORM_FEE_BPS,
    }, 85)).toEqual({
      grossAmount: 100,
      creatorAmount: 85,
      platformFeeAmount: 15,
      platformFeeBps: PLATFORM_FEE_BPS,
      hasPlatformFeeMetadata: true,
    })
  })

  it('falls back safely when metadata is absent or inconsistent', () => {
    expect(getRevenueSplitBreakdown({}, 85)).toEqual({
      grossAmount: 85,
      creatorAmount: 85,
      platformFeeAmount: 0,
      platformFeeBps: null,
      hasPlatformFeeMetadata: false,
    })

    expect(getRevenueSplitBreakdown({
      gross_amount: 100,
      creator_amount: 100,
      platform_fee_amount: 15,
      platform_fee_bps: BPS_DENOMINATOR + 1,
    }, 85)).toMatchObject({
      grossAmount: 85,
      creatorAmount: 85,
      platformFeeAmount: 0,
      hasPlatformFeeMetadata: false,
    })
  })
})
