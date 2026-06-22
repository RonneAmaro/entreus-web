import { describe, expect, it } from 'vitest'
import { verifyVipPaymentForActivation } from '../../lib/vip-payment-verification'

const order = {
  productType: 'vip_plus',
  planKey: 'vip_30d',
  totalBrlCents: 2050,
  paymentMethodOption: 'mercadopago_pix',
  providerPreferenceId: 'pref_example',
  processedAt: null,
}

const approvedPayment = {
  status: 'approved',
  transactionAmount: 20.5,
  currencyId: 'BRL',
  metadata: { productType: 'vip_plus', planKey: 'vip_30d' },
  providerPreferenceId: 'pref_example',
}

describe('Mercado Pago VIP webhook verification', () => {
  it('allows activation only for an approved payment with matching amount and plan', () => {
    expect(verifyVipPaymentForActivation(order, approvedPayment)).toMatchObject({
      valid: true,
      alreadyProcessed: false,
      reason: 'approved',
    })
  })

  it('does not activate VIP for a pending or refused payment', () => {
    expect(verifyVipPaymentForActivation(order, { ...approvedPayment, status: 'pending' }).valid).toBe(false)
    expect(verifyVipPaymentForActivation(order, { ...approvedPayment, status: 'rejected' }).valid).toBe(false)
  })

  it('keeps repeated webhook deliveries idempotent', () => {
    expect(
      verifyVipPaymentForActivation({ ...order, processedAt: '2026-06-22T00:00:00.000Z' }, approvedPayment),
    ).toMatchObject({ valid: true, alreadyProcessed: true, reason: 'already_processed' })
  })

  it('rejects a divergent amount, plan, preference, or manual Pix order', () => {
    expect(
      verifyVipPaymentForActivation(order, { ...approvedPayment, transactionAmount: 20.49 }).reason,
    ).toBe('invalid_amount')
    expect(
      verifyVipPaymentForActivation(order, {
        ...approvedPayment,
        metadata: { productType: 'vip_plus', planKey: 'vip_365d' },
      }).reason,
    ).toBe('invalid_plan')
    expect(
      verifyVipPaymentForActivation(order, { ...approvedPayment, providerPreferenceId: 'pref_other' }).reason,
    ).toBe('invalid_preference')
    expect(
      verifyVipPaymentForActivation({ ...order, paymentMethodOption: 'pix_manual' }, approvedPayment).reason,
    ).toBe('manual_payment_requires_confirmation')
  })
})
