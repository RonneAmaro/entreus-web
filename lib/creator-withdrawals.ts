export const ITACASH_PER_BRL = 10
export const MIN_WITHDRAWAL_BRL = 100
export const MIN_WITHDRAWAL_ITACASH = MIN_WITHDRAWAL_BRL * ITACASH_PER_BRL

export const CREATOR_WITHDRAWAL_STATUSES = [
  'pending',
  'reviewing',
  'approved',
  'paid',
  'rejected',
  'cancelled',
] as const
export const CREATOR_WITHDRAWAL_PAYMENT_METHODS = [
  'pix',
  'bank_transfer',
  'international_manual',
  'other_manual',
] as const
export const PIX_KEY_TYPES = ['cpf', 'email', 'phone', 'random', 'cnpj'] as const
export const BANK_ACCOUNT_TYPES = ['checking', 'savings', 'payment'] as const
export const ADMIN_CREATOR_WITHDRAWAL_ACTIONS = ['reviewing', 'approved', 'paid', 'rejected'] as const

export type CreatorWithdrawalStatus = (typeof CREATOR_WITHDRAWAL_STATUSES)[number]
export type CreatorWithdrawalPaymentMethod = (typeof CREATOR_WITHDRAWAL_PAYMENT_METHODS)[number]
export type PixKeyType = (typeof PIX_KEY_TYPES)[number]
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number]
export type AdminCreatorWithdrawalAction = (typeof ADMIN_CREATOR_WITHDRAWAL_ACTIONS)[number]

export type CreatorWithdrawalErrorReason =
  | 'not_authenticated'
  | 'admin_required'
  | 'invalid_amount'
  | 'minimum_amount'
  | 'insufficient_balance'
  | 'invalid_payment_method'
  | 'invalid_payment_details'
  | 'invalid_pix_key'
  | 'invalid_pix_key_type'
  | 'invalid_holder_name'
  | 'request_not_found'
  | 'action_not_allowed'
  | 'rpc_unavailable'
  | 'internal'

export type PixWithdrawalPaymentDetails = {
  method: 'pix'
  pixKey: string
  pixKeyType: PixKeyType
  holderName: string
}

export type BankTransferWithdrawalPaymentDetails = {
  method: 'bank_transfer'
  holderName: string
  document: string
  bank: string
  agency: string
  account: string
  accountType: BankAccountType
  notes?: string
}

export type InternationalManualWithdrawalPaymentDetails = {
  method: 'international_manual'
  holderName: string
  country: string
  desiredMethod: string
  notes?: string
}

export type OtherManualWithdrawalPaymentDetails = {
  method: 'other_manual'
  holderName: string
  methodDescription: string
  notes?: string
}

export type CreatorWithdrawalPaymentDetails =
  | PixWithdrawalPaymentDetails
  | BankTransferWithdrawalPaymentDetails
  | InternationalManualWithdrawalPaymentDetails
  | OtherManualWithdrawalPaymentDetails

export type CreatorWithdrawalPayload = {
  amountItacash: number
  amountBrl: number
  paymentMethod: CreatorWithdrawalPaymentMethod
  paymentDetails: CreatorWithdrawalPaymentDetails
}

export type CreatorWithdrawalValidationInput = {
  amountItacash?: unknown
  amount_itacash?: unknown
  paymentMethod?: unknown
  payment_method?: unknown
  paymentDetails?: unknown
  payment_details?: unknown
  pixKey?: unknown
  pix_key?: unknown
  pixKeyType?: unknown
  pix_key_type?: unknown
  holderName?: unknown
  holder_name?: unknown
  bankHolderName?: unknown
  bank_holder_name?: unknown
  bankDocument?: unknown
  bank_document?: unknown
  bank?: unknown
  bankName?: unknown
  bank_name?: unknown
  agency?: unknown
  bankAgency?: unknown
  bank_agency?: unknown
  account?: unknown
  bankAccount?: unknown
  bank_account?: unknown
  accountType?: unknown
  account_type?: unknown
  bankAccountType?: unknown
  bank_account_type?: unknown
  bankNotes?: unknown
  bank_notes?: unknown
  internationalHolderName?: unknown
  international_holder_name?: unknown
  country?: unknown
  internationalCountry?: unknown
  international_country?: unknown
  desiredMethod?: unknown
  desired_method?: unknown
  internationalDesiredMethod?: unknown
  international_desired_method?: unknown
  internationalNotes?: unknown
  international_notes?: unknown
  otherHolderName?: unknown
  other_holder_name?: unknown
  methodDescription?: unknown
  method_description?: unknown
  otherMethodDescription?: unknown
  other_method_description?: unknown
  otherNotes?: unknown
  other_notes?: unknown
  notes?: unknown
  availableBalance?: number | null
}

export type CreatorWithdrawalValidationResult =
  | { ok: true; value: CreatorWithdrawalPayload }
  | { ok: false; reason: CreatorWithdrawalErrorReason; message: string }

export type WithdrawalPaymentDisplayFieldLabel =
  | 'pixKeyType'
  | 'pixKey'
  | 'holderName'
  | 'holderDocument'
  | 'bank'
  | 'agency'
  | 'account'
  | 'accountType'
  | 'note'
  | 'country'
  | 'desiredMethod'
  | 'notes'
  | 'methodDescription'

export type WithdrawalPaymentDisplayField = {
  label: WithdrawalPaymentDisplayFieldLabel
  value: string
}

export const CREATOR_WITHDRAWAL_ERROR_MESSAGES: Record<CreatorWithdrawalErrorReason, string> = {
  not_authenticated: 'Entre na sua conta para solicitar saque.',
  admin_required: 'Acao permitida apenas para administradores.',
  invalid_amount: 'Informe um valor inteiro em ItaCash.',
  minimum_amount: 'O saque minimo e de 1000 ItaCash.',
  insufficient_balance: 'Saldo insuficiente para solicitar este saque.',
  invalid_payment_method: 'Selecione um metodo de recebimento valido.',
  invalid_payment_details: 'Confira os dados do metodo de recebimento.',
  invalid_pix_key: 'Informe uma chave Pix valida.',
  invalid_pix_key_type: 'Selecione um tipo de chave Pix valido.',
  invalid_holder_name: 'Informe o nome do titular do recebimento.',
  request_not_found: 'Solicitacao de saque nao encontrada.',
  action_not_allowed: 'Esta solicitacao nao pode ser processada com essa acao.',
  rpc_unavailable: 'Saque manual ainda nao esta disponivel para este metodo. Revise e aplique a migration primeiro.',
  internal: 'Nao foi possivel processar o saque agora.',
}

const STATUS_LABELS: Record<CreatorWithdrawalStatus, string> = {
  pending: 'Pendente',
  reviewing: 'Em analise',
  approved: 'Aprovado',
  paid: 'Pago',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
}

const PAYMENT_METHOD_LABELS: Record<CreatorWithdrawalPaymentMethod, string> = {
  pix: 'Pix',
  bank_transfer: 'Transferencia bancaria nacional',
  international_manual: 'Internacional/manual em analise',
  other_manual: 'Outro/manual',
}

const PAYMENT_METHOD_NOTICES: Record<CreatorWithdrawalPaymentMethod, string> = {
  pix: 'Pix e o metodo recomendado no Brasil.',
  bank_transfer: 'Transferencia bancaria pode levar mais tempo.',
  international_manual: 'Saques internacionais estao em analise e podem exigir conferencia manual.',
  other_manual: 'A equipe EntreUS vai conferir este metodo manualmente antes de pagar.',
}

const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  phone: 'Telefone',
  random: 'Chave aleatoria',
}

const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Conta poupanca',
  payment: 'Conta pagamento',
}

const HOLDER_NAME_MAX_LENGTH = 160
const PIX_KEY_MAX_LENGTH = 254
const PAYMENT_TEXT_MAX_LENGTH = 160
const PAYMENT_NOTES_MAX_LENGTH = 500
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validationError(reason: CreatorWithdrawalErrorReason): { ok: false; reason: CreatorWithdrawalErrorReason; message: string } {
  return { ok: false, reason, message: getCreatorWithdrawalErrorMessage(reason) }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readFirstValue(
  input: CreatorWithdrawalValidationInput,
  detailKeys: string[],
  topLevelKeys: string[] = detailKeys,
) {
  const details = asRecord(input.paymentDetails ?? input.payment_details)
  for (const key of detailKeys) {
    if (details[key] !== undefined) return details[key]
  }

  const topLevel = input as Record<string, unknown>
  for (const key of topLevelKeys) {
    if (topLevel[key] !== undefined) return topLevel[key]
  }

  return undefined
}

function sanitizeText(value: unknown, maxLength = PAYMENT_TEXT_MAX_LENGTH) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

function optionalText(value: unknown, maxLength = PAYMENT_NOTES_MAX_LENGTH) {
  const sanitized = sanitizeText(value, maxLength)
  return sanitized || undefined
}

function readDetailString(details: unknown, keys: string[]) {
  const record = asRecord(details)
  for (const key of keys) {
    const value = sanitizeText(record[key], PAYMENT_NOTES_MAX_LENGTH)
    if (value) return value
  }
  return ''
}

function readDetailMethod(details: unknown) {
  const record = asRecord(details)
  return normalizeWithdrawalPaymentMethod(record.method ?? record.paymentMethod ?? record.payment_method)
}

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
    return validationError('invalid_amount')
  }

  if (amountItacash < MIN_WITHDRAWAL_ITACASH) {
    return validationError('minimum_amount')
  }

  if (
    typeof availableBalance === 'number' &&
    Number.isFinite(availableBalance) &&
    amountItacash > Math.max(0, Math.floor(availableBalance))
  ) {
    return validationError('insufficient_balance')
  }

  return {
    ok: true,
    value: {
      amountItacash,
      amountBrl: convertItaCashToBrl(amountItacash),
      paymentMethod: 'pix',
      paymentDetails: {
        method: 'pix',
        pixKey: '',
        pixKeyType: 'cpf',
        holderName: '',
      },
    },
  }
}

export function normalizeWithdrawalPaymentMethod(value: unknown): CreatorWithdrawalPaymentMethod | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return (CREATOR_WITHDRAWAL_PAYMENT_METHODS as readonly string[]).includes(normalized)
    ? normalized as CreatorWithdrawalPaymentMethod
    : null
}

export function validatePixKeyType(value: unknown): value is PixKeyType {
  return typeof value === 'string' && (PIX_KEY_TYPES as readonly string[]).includes(value.trim().toLowerCase())
}

export function validateBankAccountType(value: unknown): value is BankAccountType {
  return typeof value === 'string' && (BANK_ACCOUNT_TYPES as readonly string[]).includes(value.trim().toLowerCase())
}

export function sanitizePixKey(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, PIX_KEY_MAX_LENGTH)
}

export function sanitizeHolderName(value: unknown) {
  return sanitizeText(value, HOLDER_NAME_MAX_LENGTH)
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

export function getWithdrawalPaymentMethodLabel(value: unknown) {
  const method = normalizeWithdrawalPaymentMethod(value) || 'pix'
  return PAYMENT_METHOD_LABELS[method]
}

export function getWithdrawalPaymentMethodNotice(value: unknown) {
  const method = normalizeWithdrawalPaymentMethod(value) || 'pix'
  return PAYMENT_METHOD_NOTICES[method]
}

export function getPixKeyTypeLabel(value: unknown) {
  const normalized = validatePixKeyType(value) ? value.trim().toLowerCase() as PixKeyType : 'cpf'
  return PIX_KEY_TYPE_LABELS[normalized]
}

export function getBankAccountTypeLabel(value: unknown) {
  const normalized = validateBankAccountType(value) ? value.trim().toLowerCase() as BankAccountType : 'checking'
  return BANK_ACCOUNT_TYPE_LABELS[normalized]
}

export function canRequestWithdrawal(balance: unknown) {
  return typeof balance === 'number' && Number.isFinite(balance) && balance >= MIN_WITHDRAWAL_ITACASH
}

function validatePixPaymentDetails(input: CreatorWithdrawalValidationInput) {
  const rawPixKeyType = readFirstValue(input, ['pixKeyType', 'pix_key_type'])
  if (!validatePixKeyType(rawPixKeyType)) {
    return validationError('invalid_pix_key_type')
  }

  const pixKey = sanitizePixKey(readFirstValue(input, ['pixKey', 'pix_key']))
  if (pixKey.length < 3) {
    return validationError('invalid_pix_key')
  }

  const holderName = sanitizeHolderName(readFirstValue(input, ['holderName', 'holder_name', 'pixHolderName', 'pix_holder_name']))
  if (holderName.length < 2) {
    return validationError('invalid_holder_name')
  }

  return {
    ok: true as const,
    details: {
      method: 'pix' as const,
      pixKey,
      pixKeyType: rawPixKeyType.trim().toLowerCase() as PixKeyType,
      holderName,
    },
  }
}

function validateBankTransferPaymentDetails(input: CreatorWithdrawalValidationInput) {
  const holderName = sanitizeHolderName(readFirstValue(
    input,
    ['holderName', 'holder_name'],
    ['bankHolderName', 'bank_holder_name', 'holderName', 'holder_name'],
  ))
  if (holderName.length < 2) {
    return validationError('invalid_holder_name')
  }

  const document = sanitizeText(readFirstValue(
    input,
    ['document', 'holderDocument', 'holder_document'],
    ['bankDocument', 'bank_document', 'document', 'holderDocument', 'holder_document'],
  ), 32)
  const bank = sanitizeText(readFirstValue(input, ['bank', 'bankName', 'bank_name'], ['bankName', 'bank_name', 'bank']), 80)
  const agency = sanitizeText(readFirstValue(input, ['agency', 'bankAgency', 'bank_agency'], ['bankAgency', 'bank_agency', 'agency']), 32)
  const account = sanitizeText(readFirstValue(input, ['account', 'bankAccount', 'bank_account'], ['bankAccount', 'bank_account', 'account']), 48)
  const rawAccountType = readFirstValue(
    input,
    ['accountType', 'account_type', 'bankAccountType', 'bank_account_type'],
    ['bankAccountType', 'bank_account_type', 'accountType', 'account_type'],
  )
  const notes = optionalText(readFirstValue(input, ['notes'], ['bankNotes', 'bank_notes', 'notes']))

  if (
    document.length < 3 ||
    bank.length < 2 ||
    agency.length < 1 ||
    account.length < 1 ||
    !validateBankAccountType(rawAccountType)
  ) {
    return validationError('invalid_payment_details')
  }

  return {
    ok: true as const,
    details: {
      method: 'bank_transfer' as const,
      holderName,
      document,
      bank,
      agency,
      account,
      accountType: rawAccountType.trim().toLowerCase() as BankAccountType,
      ...(notes ? { notes } : {}),
    },
  }
}

function validateInternationalManualPaymentDetails(input: CreatorWithdrawalValidationInput) {
  const holderName = sanitizeHolderName(readFirstValue(
    input,
    ['holderName', 'holder_name'],
    ['internationalHolderName', 'international_holder_name', 'holderName', 'holder_name'],
  ))
  if (holderName.length < 2) {
    return validationError('invalid_holder_name')
  }

  const country = sanitizeText(readFirstValue(input, ['country'], ['internationalCountry', 'international_country', 'country']), 80)
  const desiredMethod = sanitizeText(readFirstValue(
    input,
    ['desiredMethod', 'desired_method', 'method'],
    ['internationalDesiredMethod', 'international_desired_method', 'desiredMethod', 'desired_method'],
  ), 120)
  const notes = optionalText(readFirstValue(input, ['notes'], ['internationalNotes', 'international_notes', 'notes']))

  if (country.length < 2 || desiredMethod.length < 2) {
    return validationError('invalid_payment_details')
  }

  return {
    ok: true as const,
    details: {
      method: 'international_manual' as const,
      holderName,
      country,
      desiredMethod,
      ...(notes ? { notes } : {}),
    },
  }
}

function validateOtherManualPaymentDetails(input: CreatorWithdrawalValidationInput) {
  const holderName = sanitizeHolderName(readFirstValue(
    input,
    ['holderName', 'holder_name'],
    ['otherHolderName', 'other_holder_name', 'holderName', 'holder_name'],
  ))
  if (holderName.length < 2) {
    return validationError('invalid_holder_name')
  }

  const methodDescription = sanitizeText(readFirstValue(
    input,
    ['methodDescription', 'method_description', 'description'],
    ['otherMethodDescription', 'other_method_description', 'methodDescription', 'method_description'],
  ), 160)
  const notes = optionalText(readFirstValue(input, ['notes'], ['otherNotes', 'other_notes', 'notes']))

  if (methodDescription.length < 3) {
    return validationError('invalid_payment_details')
  }

  return {
    ok: true as const,
    details: {
      method: 'other_manual' as const,
      holderName,
      methodDescription,
      ...(notes ? { notes } : {}),
    },
  }
}

function validatePaymentDetails(
  method: CreatorWithdrawalPaymentMethod,
  input: CreatorWithdrawalValidationInput,
) {
  if (method === 'pix') return validatePixPaymentDetails(input)
  if (method === 'bank_transfer') return validateBankTransferPaymentDetails(input)
  if (method === 'international_manual') return validateInternationalManualPaymentDetails(input)
  return validateOtherManualPaymentDetails(input)
}

export function validateWithdrawalRequestPayload(
  input: CreatorWithdrawalValidationInput,
): CreatorWithdrawalValidationResult {
  const amountValidation = validateWithdrawalAmount(
    input.amountItacash ?? input.amount_itacash,
    input.availableBalance,
  )

  if (!amountValidation.ok) return amountValidation

  const details = asRecord(input.paymentDetails ?? input.payment_details)
  const method = normalizeWithdrawalPaymentMethod(
    input.paymentMethod ?? input.payment_method ?? details.method ?? details.paymentMethod ?? details.payment_method ?? 'pix',
  )

  if (!method) {
    return validationError('invalid_payment_method')
  }

  const detailsValidation = validatePaymentDetails(method, input)

  if (!detailsValidation.ok) return detailsValidation

  const amountItacash = amountValidation.value.amountItacash

  return {
    ok: true,
    value: {
      amountItacash,
      amountBrl: convertItaCashToBrl(amountItacash),
      paymentMethod: method,
      paymentDetails: detailsValidation.details,
    },
  }
}

export function normalizeAdminCreatorWithdrawalAction(value: unknown): AdminCreatorWithdrawalAction | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'reject') return 'rejected'
  if (normalized === 'approve') return 'approved'
  if (normalized === 'in_review' || normalized === 'review') return 'reviewing'

  return (ADMIN_CREATOR_WITHDRAWAL_ACTIONS as readonly string[]).includes(normalized)
    ? normalized as AdminCreatorWithdrawalAction
    : null
}

export function canAdminUpdateCreatorWithdrawalStatus(
  isAdmin: boolean,
  currentStatus: unknown,
  action: unknown,
) {
  if (!isAdmin) return false

  const status = normalizeWithdrawalStatus(currentStatus)
  const normalizedAction = normalizeAdminCreatorWithdrawalAction(action)
  if (!normalizedAction) return false

  if (normalizedAction === 'reviewing') return status === 'pending'
  if (normalizedAction === 'approved') return status === 'pending' || status === 'reviewing'
  return status === 'pending' || status === 'reviewing' || status === 'approved'
}

export function isOpenCreatorWithdrawalStatus(value: unknown) {
  const status = normalizeWithdrawalStatus(value)
  return status === 'pending' || status === 'reviewing' || status === 'approved'
}

export function formatWithdrawalPaymentDetailsSummary(methodValue: unknown, detailsValue: unknown) {
  const method = normalizeWithdrawalPaymentMethod(methodValue) || readDetailMethod(detailsValue) || 'pix'
  const details = asRecord(detailsValue)

  if (method === 'pix') {
    const keyType = getPixKeyTypeLabel(details.pixKeyType ?? details.pix_key_type)
    const holderName = readDetailString(details, ['holderName', 'holder_name'])
    return holderName ? `Pix ${keyType} - ${holderName}` : `Pix ${keyType}`
  }

  if (method === 'bank_transfer') {
    const bank = readDetailString(details, ['bank', 'bankName', 'bank_name'])
    const accountType = getBankAccountTypeLabel(details.accountType ?? details.account_type)
    return bank ? `${PAYMENT_METHOD_LABELS.bank_transfer} - ${bank} - ${accountType}` : PAYMENT_METHOD_LABELS.bank_transfer
  }

  if (method === 'international_manual') {
    const country = readDetailString(details, ['country'])
    return country ? `${PAYMENT_METHOD_LABELS.international_manual} - ${country}` : PAYMENT_METHOD_LABELS.international_manual
  }

  const description = readDetailString(details, ['methodDescription', 'method_description', 'description'])
  return description ? `${PAYMENT_METHOD_LABELS.other_manual} - ${description}` : PAYMENT_METHOD_LABELS.other_manual
}

export function getWithdrawalPaymentDetailsForAdmin(
  methodValue: unknown,
  detailsValue: unknown,
): WithdrawalPaymentDisplayField[] {
  const method = normalizeWithdrawalPaymentMethod(methodValue) || readDetailMethod(detailsValue) || 'pix'
  const details = asRecord(detailsValue)

  if (method === 'pix') {
    const fields: WithdrawalPaymentDisplayField[] = [
      { label: 'pixKeyType', value: getPixKeyTypeLabel(details.pixKeyType ?? details.pix_key_type) },
      { label: 'pixKey', value: readDetailString(details, ['pixKey', 'pix_key']) },
      { label: 'holderName', value: readDetailString(details, ['holderName', 'holder_name']) },
    ]
    return fields.filter((field) => field.value)
  }

  if (method === 'bank_transfer') {
    const fields: WithdrawalPaymentDisplayField[] = [
      { label: 'holderName', value: readDetailString(details, ['holderName', 'holder_name']) },
      { label: 'holderDocument', value: readDetailString(details, ['document', 'holderDocument', 'holder_document']) },
      { label: 'bank', value: readDetailString(details, ['bank', 'bankName', 'bank_name']) },
      { label: 'agency', value: readDetailString(details, ['agency', 'bankAgency', 'bank_agency']) },
      { label: 'account', value: readDetailString(details, ['account', 'bankAccount', 'bank_account']) },
      { label: 'accountType', value: getBankAccountTypeLabel(details.accountType ?? details.account_type) },
      { label: 'note', value: readDetailString(details, ['notes']) },
    ]
    return fields.filter((field) => field.value)
  }

  if (method === 'international_manual') {
    const fields: WithdrawalPaymentDisplayField[] = [
      { label: 'holderName', value: readDetailString(details, ['holderName', 'holder_name']) },
      { label: 'country', value: readDetailString(details, ['country']) },
      { label: 'desiredMethod', value: readDetailString(details, ['desiredMethod', 'desired_method', 'method']) },
      { label: 'notes', value: readDetailString(details, ['notes']) },
    ]
    return fields.filter((field) => field.value)
  }

  const fields: WithdrawalPaymentDisplayField[] = [
    { label: 'holderName', value: readDetailString(details, ['holderName', 'holder_name']) },
    { label: 'methodDescription', value: readDetailString(details, ['methodDescription', 'method_description', 'description']) },
    { label: 'notes', value: readDetailString(details, ['notes']) },
  ]
  return fields.filter((field) => field.value)
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
  if (lower.includes('payment method')) return 'invalid_payment_method'
  if (lower.includes('payment detail') || lower.includes('bank') || lower.includes('international')) return 'invalid_payment_details'
  if (lower.includes('pix key type')) return 'invalid_pix_key_type'
  if (lower.includes('pix key')) return 'invalid_pix_key'
  if (lower.includes('holder')) return 'invalid_holder_name'
  if (lower.includes('not found')) return 'request_not_found'
  if (lower.includes('only pending') || lower.includes('already') || lower.includes('process') || lower.includes('status')) return 'action_not_allowed'
  if (
    lower.includes('could not find the function') ||
    lower.includes('schema cache') ||
    lower.includes('creator_withdrawal')
  ) {
    return 'rpc_unavailable'
  }

  return 'internal'
}
