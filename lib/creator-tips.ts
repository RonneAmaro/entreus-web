import { getRevenueSplitBreakdown } from './revenue-split'

export const CREATOR_TIP_QUICK_AMOUNTS = [10, 25, 50, 100] as const
export const CREATOR_TIP_MIN_AMOUNT = 1
export const CREATOR_TIP_MESSAGE_MAX_LENGTH = 160

export type CreatorTipErrorReason =
  | 'not_authenticated'
  | 'missing_receiver'
  | 'invalid_receiver'
  | 'creator_not_found'
  | 'invalid_post'
  | 'post_not_found'
  | 'blocked_adult_post'
  | 'invalid_amount'
  | 'self_tip'
  | 'insufficient_balance'
  | 'rpc_unavailable'
  | 'internal'

export type CreatorTipPayload = {
  receiverUserId: string
  amount: number
  postId: string | null
  message: string | null
}

export type CreatorTipValidationInput = {
  receiverUserId?: unknown
  amount?: unknown
  postId?: unknown
  message?: unknown
  currentUserId?: string | null
  availableBalance?: number | null
}

export type CreatorTipValidationResult =
  | { ok: true; value: CreatorTipPayload }
  | { ok: false; reason: CreatorTipErrorReason; message: string }

export type CreatorTipTransactionRow = {
  id?: string | null
  amount?: unknown
  created_at?: string | null
  metadata?: unknown
}

export type CreatorTipRecentItem = {
  id: string
  amount: number
  grossAmount: number
  platformFeeAmount: number
  createdAt: string | null
  senderId: string | null
  message: string | null
}

export type CreatorTipsSummary = {
  totalReceived: number
  grossAmount: number
  platformFeeAmount: number
  countReceived: number
  recentTips: CreatorTipRecentItem[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const CREATOR_TIP_ERROR_MESSAGES: Record<CreatorTipErrorReason, string> = {
  not_authenticated: 'Entre na sua conta para enviar uma gorjeta.',
  missing_receiver: 'Criador nao encontrado.',
  invalid_receiver: 'Criador nao encontrado.',
  creator_not_found: 'Criador nao encontrado.',
  invalid_post: 'Publicacao invalida.',
  post_not_found: 'Publicacao do criador nao encontrada.',
  blocked_adult_post: 'Publicacao indisponivel para sua conta.',
  invalid_amount: 'Informe um valor inteiro positivo em ItaCash.',
  self_tip: 'Voce nao pode apoiar a si mesmo.',
  insufficient_balance: 'Saldo insuficiente.',
  rpc_unavailable: 'Gorjetas ItaCash ainda nao estao disponiveis.',
  internal: 'Nao foi possivel enviar a gorjeta agora.',
}

export function getCreatorTipErrorMessage(reason: CreatorTipErrorReason) {
  return CREATOR_TIP_ERROR_MESSAGES[reason] || CREATOR_TIP_ERROR_MESSAGES.internal
}

export function isUuid(value: unknown) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim())
}

export function normalizeCreatorTipAmount(value: unknown) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return null
    return value
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null

  const parsed = Number.parseInt(trimmed, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function normalizeCreatorTipMessage(value: unknown) {
  if (typeof value !== 'string') return null

  const clean = value.trim().replace(/\s+/g, ' ').slice(0, CREATOR_TIP_MESSAGE_MAX_LENGTH)
  return clean || null
}

function normalizeOptionalUuid(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  if (!isUuid(value)) return undefined
  return String(value).trim()
}

export function validateCreatorTipPayload(input: CreatorTipValidationInput): CreatorTipValidationResult {
  if (!input.receiverUserId) {
    return { ok: false, reason: 'missing_receiver', message: getCreatorTipErrorMessage('missing_receiver') }
  }

  if (!isUuid(input.receiverUserId)) {
    return { ok: false, reason: 'invalid_receiver', message: getCreatorTipErrorMessage('invalid_receiver') }
  }

  const receiverUserId = String(input.receiverUserId).trim()
  if (input.currentUserId && receiverUserId === input.currentUserId) {
    return { ok: false, reason: 'self_tip', message: getCreatorTipErrorMessage('self_tip') }
  }

  const amount = normalizeCreatorTipAmount(input.amount)
  if (amount === null || amount < CREATOR_TIP_MIN_AMOUNT) {
    return { ok: false, reason: 'invalid_amount', message: getCreatorTipErrorMessage('invalid_amount') }
  }

  if (
    typeof input.availableBalance === 'number' &&
    Number.isFinite(input.availableBalance) &&
    amount > Math.max(0, Math.floor(input.availableBalance))
  ) {
    return { ok: false, reason: 'insufficient_balance', message: getCreatorTipErrorMessage('insufficient_balance') }
  }

  const postId = normalizeOptionalUuid(input.postId)
  if (postId === undefined) {
    return { ok: false, reason: 'invalid_post', message: getCreatorTipErrorMessage('invalid_post') }
  }

  return {
    ok: true,
    value: {
      receiverUserId,
      amount,
      postId,
      message: normalizeCreatorTipMessage(input.message),
    },
  }
}

export function normalizeCreatorTipRpcError(error: unknown): CreatorTipErrorReason {
  const message = typeof error === 'string'
    ? error
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : ''
  const lower = message.toLowerCase()

  if (lower.includes('not authenticated') || lower.includes('jwt') || lower.includes('session')) {
    return 'not_authenticated'
  }

  if (lower.includes('insufficient') || lower.includes('saldo')) {
    return 'insufficient_balance'
  }

  if (lower.includes('invalid tip amount')) {
    return 'invalid_amount'
  }

  if (lower.includes('invalid tip receiver')) {
    return 'self_tip'
  }

  if (
    lower.includes('could not find the function') ||
    lower.includes('schema cache') ||
    lower.includes('send_itacash_tip')
  ) {
    return 'rpc_unavailable'
  }

  if (
    lower.includes('foreign key') ||
    lower.includes('violates') ||
    lower.includes('auth.users') ||
    lower.includes('receiver')
  ) {
    return 'creator_not_found'
  }

  return 'internal'
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function safePositiveAmount(value: unknown) {
  const amount = normalizeCreatorTipAmount(value)
  return amount && amount > 0 ? amount : 0
}

export function summarizeCreatorTips(
  rows: CreatorTipTransactionRow[],
  recentLimit = 5,
): CreatorTipsSummary {
  const positiveRows = rows
    .map((row) => ({ row, amount: safePositiveAmount(row.amount) }))
    .filter((item) => item.amount > 0)
    .map((item) => ({
      ...item,
      split: getRevenueSplitBreakdown(item.row.metadata, item.amount),
    }))

  const recentTips = positiveRows
    .slice()
    .sort((left, right) => {
      const rightTime = Date.parse(right.row.created_at || '')
      const leftTime = Date.parse(left.row.created_at || '')
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })
    .slice(0, Math.max(0, recentLimit))
    .map(({ row, amount, split }, index) => {
      const metadata = normalizeMetadata(row.metadata)
      const senderId = isUuid(metadata.sender_id) ? String(metadata.sender_id) : null
      const message = normalizeCreatorTipMessage(metadata.message)

      return {
        id: row.id || `tip-${index}`,
        amount,
        grossAmount: split.grossAmount,
        platformFeeAmount: split.platformFeeAmount,
        createdAt: row.created_at || null,
        senderId,
        message,
      }
    })

  return {
    totalReceived: positiveRows.reduce((total, item) => total + item.amount, 0),
    grossAmount: positiveRows.reduce((total, item) => total + item.split.grossAmount, 0),
    platformFeeAmount: positiveRows.reduce((total, item) => total + item.split.platformFeeAmount, 0),
    countReceived: positiveRows.length,
    recentTips,
  }
}
