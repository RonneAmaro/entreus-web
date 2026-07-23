import { afterEach, describe, expect, it } from 'vitest'
import { verifyMercadoPagoWebhookSignature } from '../../app/api/payments/mercadopago/webhook/route'

const originalNodeEnv = process.env.NODE_ENV
const originalSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET

function setNodeEnv(value: string | undefined) {
  Object.assign(process.env, { NODE_ENV: value })
}

afterEach(() => {
  setNodeEnv(originalNodeEnv)
  if (originalSecret === undefined) {
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET
  } else {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = originalSecret
  }
})

describe('Mercado Pago webhook signature enforcement', () => {
  it('allows missing signature secret only outside production', () => {
    setNodeEnv('development')
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET

    const result = verifyMercadoPagoWebhookSignature(new Request('https://example.com/api/payments/mercadopago/webhook'), null)

    expect(result).toMatchObject({
      configured: false,
      ok: true,
      reason: 'signature_secret_not_configured',
    })
  })

  it('fails closed in production when the signature secret is missing', () => {
    setNodeEnv('production')
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET

    const result = verifyMercadoPagoWebhookSignature(new Request('https://example.com/api/payments/mercadopago/webhook'), null)

    expect(result).toMatchObject({
      configured: false,
      ok: false,
      reason: 'signature_secret_required_in_production',
    })
  })
})
