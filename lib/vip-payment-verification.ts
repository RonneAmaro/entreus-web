export type VipPaymentOrderForVerification = {
  productType: string
  planKey: string | null
  totalBrlCents: number
  paymentMethodOption?: string | null
  providerPreferenceId?: string | null
  processedAt?: string | null
}

export type MercadoPagoVipPaymentForVerification = {
  status: string | null | undefined
  transactionAmount: number | null | undefined
  currencyId: string | null | undefined
  metadata?: {
    productType?: string | null
    planKey?: string | null
  } | null
  providerPreferenceId?: string | null
}

export type VipPaymentVerificationResult = {
  valid: boolean
  alreadyProcessed: boolean
  reason:
    | 'approved'
    | 'already_processed'
    | 'payment_not_approved'
    | 'not_vip_order'
    | 'manual_payment_requires_confirmation'
    | 'invalid_amount'
    | 'invalid_currency'
    | 'invalid_product'
    | 'invalid_plan'
    | 'invalid_preference'
}

export function verifyVipPaymentForActivation(
  order: VipPaymentOrderForVerification,
  payment: MercadoPagoVipPaymentForVerification,
): VipPaymentVerificationResult {
  if (order.productType !== 'vip_plus') return invalid('not_vip_order')
  if (order.processedAt) return { valid: true, alreadyProcessed: true, reason: 'already_processed' }
  if (order.paymentMethodOption === 'pix_manual') return invalid('manual_payment_requires_confirmation')
  if (payment.status?.trim().toLowerCase() !== 'approved') return invalid('payment_not_approved')
  if (payment.currencyId?.trim().toUpperCase() !== 'BRL') return invalid('invalid_currency')

  const transactionAmountCents = toCents(payment.transactionAmount)
  if (transactionAmountCents === null || transactionAmountCents !== order.totalBrlCents) {
    return invalid('invalid_amount')
  }

  if (payment.metadata?.productType && payment.metadata.productType !== 'vip_plus') {
    return invalid('invalid_product')
  }

  if (payment.metadata?.planKey && payment.metadata.planKey !== order.planKey) {
    return invalid('invalid_plan')
  }

  if (
    order.providerPreferenceId &&
    payment.providerPreferenceId &&
    payment.providerPreferenceId !== order.providerPreferenceId
  ) {
    return invalid('invalid_preference')
  }

  return { valid: true, alreadyProcessed: false, reason: 'approved' }
}

function toCents(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

function invalid(reason: Exclude<VipPaymentVerificationResult['reason'], 'approved' | 'already_processed'>) {
  return { valid: false, alreadyProcessed: false, reason } satisfies VipPaymentVerificationResult
}
