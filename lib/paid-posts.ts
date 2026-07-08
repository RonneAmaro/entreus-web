import { canViewPostByClassification, type ContentAccessProfile } from './content-access'
import { getRevenueSplitBreakdown } from './revenue-split'

export const PAID_POST_MIN_PRICE = 1

export type PaidPostErrorReason =
  | 'not_authenticated'
  | 'missing_post'
  | 'invalid_post'
  | 'post_not_found'
  | 'not_paid'
  | 'already_unlocked'
  | 'invalid_price'
  | 'self_unlock'
  | 'insufficient_balance'
  | 'adult_blocked'
  | 'locked'
  | 'unlock_unavailable'
  | 'internal'

export type PaidPostLike = {
  id?: string | null
  user_id?: string | null
  is_paid?: unknown
  price_itacash?: unknown
  paid_unlocked?: unknown
  community_type?: unknown
  content_rating?: unknown
  category?: unknown
}

export type PaidPostClientSanitizable = PaidPostLike & {
  content?: string | null
  image_url?: string | null
  video_url?: string | null
  media?: unknown[]
}

export type PaidPostRenderInput = {
  viewerId?: string | null
  viewer?: ContentAccessProfile | null
  post: PaidPostLike
  hasUnlocked?: boolean | null
}

export type PaidPostTransactionRow = {
  id?: string | null
  amount?: unknown
  created_at?: string | null
  metadata?: unknown
}

export type PaidPostUnlockSummary = {
  totalReceived: number
  grossAmount: number
  platformFeeAmount: number
  unlockCount: number
  recentUnlocks: {
    id: string
    amount: number
    grossAmount: number
    platformFeeAmount: number
    createdAt: string | null
    buyerId: string | null
    postId: string | null
  }[]
  topPosts: { postId: string; unlocks: number; total: number }[]
}

export const PAID_POST_ERROR_MESSAGES: Record<PaidPostErrorReason, string> = {
  not_authenticated: 'Entre na sua conta para desbloquear este post.',
  missing_post: 'Post nao encontrado.',
  invalid_post: 'Post invalido.',
  post_not_found: 'Post nao encontrado.',
  not_paid: 'Este post nao e pago.',
  already_unlocked: 'Post ja desbloqueado.',
  invalid_price: 'Informe um preco inteiro positivo em ItaCash.',
  self_unlock: 'Voce nao pode desbloquear o proprio post.',
  insufficient_balance: 'Saldo insuficiente.',
  adult_blocked: 'Conteudo adulto exige verificacao 18+ aprovada.',
  locked: 'Desbloqueie este post para ver o conteudo.',
  unlock_unavailable: 'Desbloqueio de posts pagos ainda nao esta disponivel.',
  internal: 'Nao foi possivel desbloquear este post agora.',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function getPaidPostErrorMessage(reason: PaidPostErrorReason) {
  return PAID_POST_ERROR_MESSAGES[reason] || PAID_POST_ERROR_MESSAGES.internal
}

export function isPaidPost(post: PaidPostLike | null | undefined) {
  return Boolean(post?.is_paid) && getPaidPostPrice(post) > 0
}

export function normalizePaidPostPrice(value: unknown) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) return null
    return value
  }

  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null

  const parsed = Number.parseInt(trimmed, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function validatePaidPostPrice(value: unknown) {
  const price = normalizePaidPostPrice(value)

  if (price === null || price < PAID_POST_MIN_PRICE) {
    return {
      ok: false as const,
      reason: 'invalid_price' as const,
      message: getPaidPostErrorMessage('invalid_price'),
    }
  }

  return { ok: true as const, value: price }
}

export function getPaidPostPrice(post: PaidPostLike | null | undefined) {
  const price = normalizePaidPostPrice(post?.price_itacash)
  return price && price > 0 ? price : 0
}

export function isMissingPaidPostColumnError(error: { message?: string } | null | undefined) {
  const message = (error?.message || '').toLowerCase()
  return message.includes('is_paid') || message.includes('price_itacash') || message.includes('paid_post_unlocks')
}

export function canAuthorViewPaidPost(viewerId: string | null | undefined, authorId: string | null | undefined) {
  return Boolean(viewerId && authorId && viewerId === authorId)
}

export function canViewPaidPostContent(
  post: PaidPostLike | null | undefined,
  viewerId?: string | null,
  hasUnlocked?: boolean | null,
) {
  return !isPaidPost(post) || canAuthorViewPaidPost(viewerId, post?.user_id) || Boolean(hasUnlocked ?? post?.paid_unlocked)
}

export function sanitizeLockedPaidPostForClient<T extends PaidPostClientSanitizable>(
  post: T,
  viewerId?: string | null,
  hasUnlocked?: boolean | null,
): T {
  if (canViewPaidPostContent(post, viewerId, hasUnlocked)) return post

  return {
    ...post,
    content: null,
    image_url: null,
    video_url: null,
    media: [],
  }
}

export function validatePaidPostUnlockPayload(payload: { postId?: unknown }) {
  const postId = typeof payload.postId === 'string' ? payload.postId.trim() : ''

  if (!postId) {
    return { ok: false as const, reason: 'missing_post' as const, message: getPaidPostErrorMessage('missing_post') }
  }

  if (!UUID_PATTERN.test(postId)) {
    return { ok: false as const, reason: 'invalid_post' as const, message: getPaidPostErrorMessage('invalid_post') }
  }

  return { ok: true as const, value: { postId } }
}

export function getPaidPostBlockedReason(input: PaidPostRenderInput): PaidPostErrorReason | null {
  if (!canViewPostByClassification(input.viewer, input.post)) return 'adult_blocked'
  if (!isPaidPost(input.post)) return null
  if (canAuthorViewPaidPost(input.viewerId, input.post.user_id)) return null
  if (input.hasUnlocked) return null
  return input.viewerId ? 'locked' : 'not_authenticated'
}

export function canRenderPaidPostContent(input: PaidPostRenderInput) {
  return getPaidPostBlockedReason(input) === null
}

export function normalizePaidPostRpcError(error: unknown): PaidPostErrorReason {
  const message = typeof error === 'string'
    ? error
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : ''
  const lower = message.toLowerCase()

  if (lower.includes('not authenticated') || lower.includes('jwt') || lower.includes('session')) return 'not_authenticated'
  if (lower.includes('already unlocked') || lower.includes('ja desbloqueado')) return 'already_unlocked'
  if (lower.includes('not paid')) return 'not_paid'
  if (lower.includes('own post') || lower.includes('proprio post') || lower.includes('self')) return 'self_unlock'
  if (lower.includes('insufficient') || lower.includes('saldo')) return 'insufficient_balance'
  if (lower.includes('adult') || lower.includes('18+')) return 'adult_blocked'
  if (lower.includes('post not found') || lower.includes('not found')) return 'post_not_found'
  if (lower.includes('could not find the function') || lower.includes('unlock_paid_post') || lower.includes('schema cache')) return 'unlock_unavailable'
  return 'internal'
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizePositiveAmount(value: unknown) {
  const amount = normalizePaidPostPrice(value)
  return amount && amount > 0 ? amount : 0
}

function normalizeUuidFromMetadata(value: unknown) {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null
}

export function summarizePaidPostUnlocks(rows: PaidPostTransactionRow[], recentLimit = 5): PaidPostUnlockSummary {
  const normalized = rows
    .map((row) => ({ row, amount: normalizePositiveAmount(row.amount), metadata: normalizeMetadata(row.metadata) }))
    .filter((item) => item.amount > 0)
    .map((item) => ({
      ...item,
      split: getRevenueSplitBreakdown(item.row.metadata, item.amount),
    }))

  const postStats = new Map<string, { unlocks: number; total: number }>()

  for (const item of normalized) {
    const postId = normalizeUuidFromMetadata(item.metadata.post_id)
    if (!postId) continue
    const current = postStats.get(postId) || { unlocks: 0, total: 0 }
    current.unlocks += 1
    current.total += item.amount
    postStats.set(postId, current)
  }

  return {
    totalReceived: normalized.reduce((total, item) => total + item.amount, 0),
    grossAmount: normalized.reduce((total, item) => total + item.split.grossAmount, 0),
    platformFeeAmount: normalized.reduce((total, item) => total + item.split.platformFeeAmount, 0),
    unlockCount: normalized.length,
    recentUnlocks: normalized
      .slice()
      .sort((left, right) => {
        const rightTime = Date.parse(right.row.created_at || '')
        const leftTime = Date.parse(left.row.created_at || '')
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
      })
      .slice(0, Math.max(0, recentLimit))
      .map((item, index) => ({
        id: item.row.id || `paid-unlock-${index}`,
        amount: item.amount,
        grossAmount: item.split.grossAmount,
        platformFeeAmount: item.split.platformFeeAmount,
        createdAt: item.row.created_at || null,
        buyerId: normalizeUuidFromMetadata(item.metadata.buyer_id),
        postId: normalizeUuidFromMetadata(item.metadata.post_id),
      })),
    topPosts: Array.from(postStats.entries())
      .map(([postId, stats]) => ({ postId, ...stats }))
      .sort((left, right) => right.unlocks - left.unlocks || right.total - left.total)
      .slice(0, 5),
  }
}
