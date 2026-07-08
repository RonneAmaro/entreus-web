export const PLATFORM_FEE_BPS = 1500
export const CREATOR_SHARE_BPS = 8500
export const BPS_DENOMINATOR = 10000

export type RevenueSplit = {
  grossAmount: number
  creatorAmount: number
  platformFeeAmount: number
  platformFeeBps: number
  creatorShareBps: number
}

export type RevenueSplitMetadata = {
  gross_amount: number
  creator_amount: number
  platform_fee_amount: number
  platform_fee_bps: number
  creator_share_bps: number
}

export type RevenueSplitBreakdown = {
  grossAmount: number
  creatorAmount: number
  platformFeeAmount: number
  platformFeeBps: number | null
  hasPlatformFeeMetadata: boolean
}

function normalizeItaCashInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null
  return value
}

function normalizeNonNegativeInteger(value: unknown) {
  const amount = normalizeItaCashInteger(value)
  return amount !== null && amount >= 0 ? amount : null
}

function normalizeMetadataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function calculateRevenueSplit(grossAmount: unknown): RevenueSplit {
  const gross = normalizeItaCashInteger(grossAmount)

  if (gross === null || gross <= 0) {
    throw new RangeError('Revenue split requires a positive integer ItaCash amount.')
  }

  const platformFeeAmount = Number((BigInt(gross) * BigInt(PLATFORM_FEE_BPS)) / BigInt(BPS_DENOMINATOR))
  const creatorAmount = gross - platformFeeAmount

  if (
    creatorAmount < 0 ||
    platformFeeAmount < 0 ||
    creatorAmount + platformFeeAmount !== gross
  ) {
    throw new Error('Invalid revenue split invariant.')
  }

  return {
    grossAmount: gross,
    creatorAmount,
    platformFeeAmount,
    platformFeeBps: PLATFORM_FEE_BPS,
    creatorShareBps: CREATOR_SHARE_BPS,
  }
}

export function createRevenueSplitMetadata(split: RevenueSplit): RevenueSplitMetadata {
  return {
    gross_amount: split.grossAmount,
    creator_amount: split.creatorAmount,
    platform_fee_amount: split.platformFeeAmount,
    platform_fee_bps: split.platformFeeBps,
    creator_share_bps: split.creatorShareBps,
  }
}

export function getRevenueSplitBreakdown(
  metadata: unknown,
  creatorAmountFallback: number,
): RevenueSplitBreakdown {
  const creatorAmount = Math.max(0, Math.floor(creatorAmountFallback))
  const normalizedMetadata = normalizeMetadataObject(metadata)
  const grossAmount = normalizeNonNegativeInteger(normalizedMetadata.gross_amount)
  const metadataCreatorAmount = normalizeNonNegativeInteger(normalizedMetadata.creator_amount)
  const platformFeeAmount = normalizeNonNegativeInteger(normalizedMetadata.platform_fee_amount)
  const platformFeeBps = normalizeNonNegativeInteger(normalizedMetadata.platform_fee_bps)
  const validPlatformFeeBps = platformFeeBps !== null && platformFeeBps <= BPS_DENOMINATOR

  if (
    grossAmount !== null &&
    metadataCreatorAmount !== null &&
    platformFeeAmount !== null &&
    validPlatformFeeBps &&
    metadataCreatorAmount === creatorAmount &&
    grossAmount === metadataCreatorAmount + platformFeeAmount
  ) {
    return {
      grossAmount,
      creatorAmount,
      platformFeeAmount,
      platformFeeBps,
      hasPlatformFeeMetadata: true,
    }
  }

  return {
    grossAmount: creatorAmount,
    creatorAmount,
    platformFeeAmount: 0,
    platformFeeBps: null,
    hasPlatformFeeMetadata: false,
  }
}
