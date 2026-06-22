import { describe, expect, it } from 'vitest'
import {
  getSafeCheckoutUrl,
  getVipCheckoutButtonLabel,
  getVipPaymentReturnMessage,
} from '../../lib/vip-checkout-flow'

describe('VIP checkout flow', () => {
  it('only accepts an HTTPS checkout URL before redirecting', () => {
    expect(getSafeCheckoutUrl('https://www.mercadopago.com/checkout/v1/redirect?pref_id=example')).toContain(
      'mercadopago.com',
    )
    expect(getSafeCheckoutUrl('javascript:alert(1)')).toBeNull()
    expect(getSafeCheckoutUrl('http://checkout.example')).toBeNull()
    expect(getSafeCheckoutUrl('')).toBeNull()
  })

  it('makes the payment action explicit for a new or pending order', () => {
    expect(getVipCheckoutButtonLabel(false, false)).toBe('Pagar com Mercado Pago')
    expect(getVipCheckoutButtonLabel(false, true)).toBe('Gerar link de pagamento')
    expect(getVipCheckoutButtonLabel(true, false)).toBe('Continuar pagamento')
  })

  it('does not promise VIP activation from the browser return alone', () => {
    expect(getVipPaymentReturnMessage('success', false)).toContain('após confirmação')
    expect(getVipPaymentReturnMessage('success', true)).toBe('VIP ativo.')
    expect(getVipPaymentReturnMessage('pending', false)).toBe('Pagamento pendente.')
    expect(getVipPaymentReturnMessage('failure', false)).toBe('Pagamento não concluído.')
  })
})
