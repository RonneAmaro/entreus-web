export type VipPaymentReturnStatus = 'success' | 'pending' | 'failure' | null

export function getSafeCheckoutUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function getVipCheckoutButtonLabel(hasPendingCheckout: boolean, checkoutRequested: boolean) {
  if (hasPendingCheckout) return 'Continuar pagamento'
  if (checkoutRequested) return 'Gerar link de pagamento'
  return 'Pagar com Mercado Pago'
}

export function getVipPaymentReturnMessage(
  paymentStatus: VipPaymentReturnStatus,
  vipActive: boolean,
) {
  if (paymentStatus === 'success') {
    return vipActive
      ? 'VIP ativo.'
      : 'Pagamento recebido. Seu VIP será ativado automaticamente após confirmação.'
  }

  if (paymentStatus === 'pending') return 'Pagamento pendente.'
  if (paymentStatus === 'failure') return 'Pagamento não concluído.'

  return null
}
