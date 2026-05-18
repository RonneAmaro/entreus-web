export type PaymentMethodOption =
  | 'pix_manual'
  | 'mercadopago_pix'
  | 'mercadopago_credit_30d'
  | 'mercadopago_credit_instant'
  | 'open_finance'
  | 'boleto'

export type PaymentMethodConfig = {
  value: PaymentMethodOption
  label: string
  operatorFeePercent: number
  operatorFeeFixedCents: number
  available: boolean
  recommended?: boolean
  note: string
}

export const PLATFORM_FEE_PERCENT = 2

export const paymentMethodOptions: PaymentMethodConfig[] = [
  {
    value: 'pix_manual',
    label: 'Pix manual',
    operatorFeePercent: 0,
    operatorFeeFixedCents: 0,
    available: true,
    note: 'Conferencia manual pela equipe.',
  },
  {
    value: 'mercadopago_pix',
    label: 'Mercado Pago Pix',
    operatorFeePercent: 0.99,
    operatorFeeFixedCents: 0,
    available: true,
    recommended: true,
    note: 'Recomendado: menor taxa da operadora.',
  },
  {
    value: 'mercadopago_credit_30d',
    label: 'Cartao credito 30 dias',
    operatorFeePercent: 3.98,
    operatorFeeFixedCents: 0,
    available: true,
    note: 'Credito com recebimento em 30 dias.',
  },
  {
    value: 'mercadopago_credit_instant',
    label: 'Cartao credito na hora',
    operatorFeePercent: 4.98,
    operatorFeeFixedCents: 0,
    available: true,
    note: 'Taxa maior para recebimento mais rapido.',
  },
  {
    value: 'open_finance',
    label: 'Open Finance',
    operatorFeePercent: 0,
    operatorFeeFixedCents: 0,
    available: false,
    note: 'Em breve.',
  },
  {
    value: 'boleto',
    label: 'Boleto',
    operatorFeePercent: 0,
    operatorFeeFixedCents: 349,
    available: false,
    note: 'Opcao futura com taxa fixa.',
  },
]

export function getPaymentMethodConfig(value: string | null | undefined) {
  const fallback = paymentMethodOptions.find((option) => option.value === 'mercadopago_pix') || paymentMethodOptions[0]
  const method = paymentMethodOptions.find((option) => option.value === value) || fallback

  if (!method) {
    throw new Error('Payment methods are not configured.')
  }

  return method
}

export function calculatePaymentTotals(baseAmountBrlCents: number, methodValue: string | null | undefined) {
  const method = getPaymentMethodConfig(methodValue)
  const platformFeeBrlCents = Math.ceil(baseAmountBrlCents * (PLATFORM_FEE_PERCENT / 100))
  const percentFeeCents = Math.ceil(baseAmountBrlCents * (method.operatorFeePercent / 100))
  const operatorFeeBrlCents = percentFeeCents + method.operatorFeeFixedCents

  return {
    method,
    baseAmountBrlCents,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    platformFeeBrlCents,
    operatorFeePercent: method.operatorFeePercent,
    operatorFeeFixedCents: method.operatorFeeFixedCents,
    operatorFeeBrlCents,
    totalBrlCents: baseAmountBrlCents + platformFeeBrlCents + operatorFeeBrlCents,
  }
}
