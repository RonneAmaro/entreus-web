import { describe, expect, it } from 'vitest'
import { calculatePaymentTotals } from '@/lib/payment-fees'
import { getVipPlanSavings, VIP_PURCHASE_PLANS } from '@/lib/vip-plans'

describe('payment pricing', () => {
  it('keeps VIP prices and derives savings', () => {
    expect(VIP_PURCHASE_PLANS.map((plan) => plan.amountBrlCents)).toEqual([1990, 4990, 14990])
    expect(VIP_PURCHASE_PLANS.map(getVipPlanSavings).map((value) => value.savingsPercent)).toEqual([0, 16, 38])
  })
  it('charges no fee for manual Pix and preserves Mercado Pago fees', () => {
    expect(calculatePaymentTotals(1990, 'pix_manual')).toMatchObject({ platformFeePercent: 0, platformFeeBrlCents: 0, operatorFeePercent: 0, operatorFeeBrlCents: 0, totalBrlCents: 1990 })
    expect(calculatePaymentTotals(1990, 'mercadopago_pix').totalBrlCents).toBe(2050)
  })
})
