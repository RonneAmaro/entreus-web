export const ITACASH_PER_BRL = 10
export const MIN_WITHDRAWAL_BRL = 100
export const MIN_WITHDRAWAL_ITACASH = MIN_WITHDRAWAL_BRL * ITACASH_PER_BRL

export const CREATOR_WITHDRAWAL_STATUSES = ['pending', 'paid', 'rejected', 'cancelled'] as const
export const PIX_KEY_TYPES = ['cpf', 'email', 'phone', 'random', 'cnpj'] as const

export type CreatorWithdrawalStatus = (typeof CREATOR_WITHDRAWAL_STATUSES)[number]
export type PixKeyType = (typeof PIX_KEY_TYPES)[number]

export type CreatorWithdrawalErrorReason =
  | 'not_authenticated'
  | 'admin_required'
  | 'invalid_amount'
  | 'minimum_amount'
  | 'insufficient_balance'
  | 'invalid_pix_key'
  | 'invalid_pix_key_type'
  | 'invalid_holder_name'
  | 'request_not_found'
  | 'action_not_allowed'
  | 'rpc_unavailable'
  | 'internal'

export type CreatorWithdrawalPayload = {
  amountItacash: number
  amountBrl: number
  pixKey: string
  pixKeyType: PixKeyType
  holderName: string
}

export type CreatorWithdrawalValidationInput = {
  amountItacash?: unknown
  amount_itacash?: unknown
  pixKey?: unknown
  pix_key?: unknown
  pixKeyType?: unknown
  pix_key_type?: unknown
  holderName?: unknown
  holder_name?: unknown
  availableBalance?: number | null
}

export type CreatorWithdrawalValidationResult =
  | { ok: true; value: CreatorWithdrawalPayload }
  | { ok: false; reason: CreatorWithdrawalErrorReason; message: string }

export const CREATOR_WITHDRAWAL_ERROR_MESSAGES: Record<CreatorWithdrawalErrorReason, string> = {
  not_authenticated: 'Entre na sua conta para solicitar saque.',
  admin_required: 'Acao permitida apenas para administradores.',
  invalid_amount: 'Informe um valor inteiro em ItaCash.',
  minimum_amount: 'O saque minimo e de R$ 100,00 (1000 ItaCash).',
  insufficient_balance: 'Saldo insuficiente para solicitar este saque.',
  invalid_pix_key: 'Informe uma chave Pix valida.',
  invalid_pix_key_type: 'Selecione um tipo de chave Pix valido.',
  invalid_holder_name: 'Informe o nome do titular da chave Pix.',
  request_not_found: 'Solicitacao de saque nao encontrada.',
  action_not_allowed: 'Esta solicitacao nao pode ser processada novamente.',
  rpc_unavailable: 'Saque manual ainda nao esta disponivel. Aplique a migration primeiro.',
  internal: 'Nao foi possivel processar o saque agora.',
}

const STATUS_LABELS: Record<CreatorWithdrawalStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
}

const HOLDER_NAME_MAX_LENGTH = 160
const PIX_KEY_MAX_LENGTH = 254
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function getCreatorWithdrawalErrorMessage(reason: CreatorWithdrawalErrorReason) {
  return CREATOR_WITHDRAWAL_ERROR_MESSAGES[reason] || CREATOR_WITHDRAWAL_ERROR_MESSAGES.internal
}

export function isUuid(value: unknown) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim())
}

export function convertItaCashToBrl(value: number) {
  if (!Number.isFinite(value)) return 0
  return value / ITACASH_PER_BRL
}

export function convertBrlToItaCash(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * ITACASH_PER_BRL)
}

export function normalizeWithdrawalAmount(value: unknown) {
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

export function validateWithdrawalAmount(
  value: unknown,
  availableBalance?: number | null,
): CreatorWithdrawalValidationResult {
  const amountItacash = normalizeWithdrawalAmount(value)

  if (amountItacash === null || amountItacash <= 0) {
    return { ok: false, reason: 'invalid_amount', message: getCreatorWithdrawalErrorMessage('invalid_amount') }
  }

  if (amountItacash < MIN_WITHDRAWAL_ITACASH) {
    return { ok: false, reason: 'minimum_amount', message: getCreatorWithdrawalErrorMessage('minimum_amount') }
  }

  if (
    typeof availableBalance === 'number' &&
    Number.isFinite(availableBalance) &&
    amountItacash > Math.max(0, Math.floor(availableBalance))
  ) {
    return { ok: false, reason: 'insufficient_balance', message: getCreatorWithdrawalErrorMessage('insufficient_balance') }
  }

  return {
    ok: true,
    value: {
      amountItacash,
      amountBrl: convertItaCashToBrl(amountItacash),
      pixKey: '',
      pixKeyType: 'cpf',
      holderName: '',
    },
  }
}

export function validatePixKeyType(value: unknown): value is PixKeyType {
  return typeof value === 'string' && (PIX_KEY_TYPES as readonly string[]).includes(value.trim().toLowerCase())
}

export function sanitizePixKey(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, PIX_KEY_MAX_LENGTH)
}

export function sanitizeHolderName(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, HOLDER_NAME_MAX_LENGTH)
}

export function normalizeWithdrawalStatus(value: unknown): CreatorWithdrawalStatus {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if ((CREATOR_WITHDRAWAL_STATUSES as readonly string[]).includes(normalized)) {
      return normalized as CreatorWithdrawalStatus
    }
  }

  return 'pending'
}

export function formatWithdrawalStatus(value: unknown) {
  return STATUS_LABELS[normalizeWithdrawalStatus(value)]
}

export function canRequestWithdrawal(balance: unknown) {
  return typeof balance === 'number' && Number.isFinite(balance) && balance >= MIN_WITHDRAWAL_ITACASH
}

export function validateWithdrawalRequestPayload(
  input: CreatorWithdrawalValidationInput,
): CreatorWithdrawalValidationResult {
  const amountValidation = validateWithdrawalAmount(
    input.amountItacash ?? input.amount_itacash,
    input.availableBalance,
  )

  if (!amountValidation.ok) return amountValidation

  const rawPixKeyType = input.pixKeyType ?? input.pix_key_type
  if (!validatePixKeyType(rawPixKeyType)) {
    return { ok: false, reason: 'invalid_pix_key_type', message: getCreatorWithdrawalErrorMessage('invalid_pix_key_type') }
  }

  const pixKey = sanitizePixKey(input.pixKey ?? input.pix_key)
  if (pixKey.length < 3) {
    return { ok: false, reason: 'invalid_pix_key', message: getCreatorWithdrawalErrorMessage('invalid_pix_key') }
  }

  const holderName = sanitizeHolderName(input.holderName ?? input.holder_name)
  if (holderName.length < 2) {
    return { ok: false, reason: 'invalid_holder_name', message: getCreatorWithdrawalErrorMessage('invalid_holder_name') }
  }

  const amountItacash = amountValidation.value.amountItacash

  return {
    ok: true,
    value: {
      amountItacash,
      amountBrl: convertItaCashToBrl(amountItacash),
      pixKey,
      pixKeyType: rawPixKeyType.trim().toLowerCase() as PixKeyType,
      holderName,
    },
  }
}

export function normalizeCreatorWithdrawalRpcError(error: unknown): CreatorWithdrawalErrorReason {
  const message = typeof error === 'string'
    ? error
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : ''
  const lower = message.toLowerCase()

  if (lower.includes('not authenticated') || lower.includes('jwt') || lower.includes('session')) return 'not_authenticated'
  if (lower.includes('admin permission') || lower.includes('permission required')) return 'admin_required'
  if (lower.includes('minimum') || lower.includes('minimo') || lower.includes('1000')) return 'minimum_amount'
  if (lower.includes('invalid withdrawal amount') || lower.includes('integer')) return 'invalid_amount'
  if (lower.includes('insufficient') || lower.includes('saldo')) return 'insufficient_balance'
  if (lower.includes('pix key type')) return 'invalid_pix_key_type'
  if (lower.includes('pix key')) return 'invalid_pix_key'
  if (lower.includes('holder')) return 'invalid_holder_name'
  if (lower.includes('not found')) return 'request_not_found'
  if (lower.includes('only pending') || lower.includes('already') || lower.includes('process')) return 'action_not_allowed'
  if (
    lower.includes('could not find the function') ||
    lower.includes('schema cache') ||
    lower.includes('creator_withdrawal')
  ) {
    return 'rpc_unavailable'
  }

  return 'internal'
}
