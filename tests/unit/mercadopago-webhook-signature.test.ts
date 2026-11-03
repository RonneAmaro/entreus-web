import crypto from 'crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyMercadoPagoWebhookSignature } from '../../lib/payments/mercadopago-webhook-signature'

const originalNodeEnv = process.env.NODE_ENV
const originalSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET

function setNodeEnv(value: string | undefined) {
  Object.assign(process.env, { NODE_ENV: value })
}

function signedRequest(options: {
  dataId?: string
  requestId?: string
  timestamp?: string
  secret?: string
  signature?: string
  url?: string
}) {
  const dataId = options.dataId || 'payment-fixture-1'
  const requestId = options.requestId || 'request-fixture-1'
  const timestamp = options.timestamp || '1234567890'
  const secret = options.secret || 'fixture-secret'
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`
  const signature = options.signature || crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  return new Request(options.url || 'https://example.com/api/payments/mercadopago/webhook', {
    headers: {
      'x-request-id': requestId,
      'x-signature': `ts=${timestamp},v1=${signature}`,
    },
  })
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
  it('accepts a valid signature using the lowercased data ID', () => {
    setNodeEnv('production')
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'fixture-secret'

    const result = verifyMercadoPagoWebhookSignature(
      signedRequest({ dataId: 'PAYMENT-FIXTURE-1' }),
      { data: { id: 'PAYMENT-FIXTURE-1' } },
    )

    expect(result).toEqual({ configured: true, ok: true, reason: 'signature_checked' })
  })

  it('rejects a signature made with another secret', () => {
    setNodeEnv('production')
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'fixture-secret'

    const result = verifyMercadoPagoWebhookSignature(
      signedRequest({ secret: 'wrong-fixture-secret' }),
      { data: { id: 'payment-fixture-1' } },
    )

    expect(result).toEqual({ configured: true, ok: false, reason: 'signature_checked' })
  })

  it('rejects an altered resource ID', () => {
    setNodeEnv('production')
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'fixture-secret'

    const result = verifyMercadoPagoWebhookSignature(
      signedRequest({ dataId: 'payment-fixture-1' }),
      { data: { id: 'payment-fixture-2' } },
    )

    expect(result).toEqual({ configured: true, ok: false, reason: 'signature_checked' })
  })

  it('rejects a timestamp changed after signing', () => {
    setNodeEnv('production')
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'fixture-secret'

    const original = signedRequest({ timestamp: '1234567890' })
    const signature = original.headers.get('x-signature')?.split('v1=')[1]
    const altered = signedRequest({ timestamp: '1234567891', signature })
    const result = verifyMercadoPagoWebhookSignature(altered, { data: { id: 'payment-fixture-1' } })

    expect(result).toEqual({ configured: true, ok: false, reason: 'signature_checked' })
  })

  it('rejects missing signature headers and incomplete data', () => {
    setNodeEnv('production')
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'fixture-secret'

    const unsigned = new Request('https://example.com/api/payments/mercadopago/webhook')
    expect(verifyMercadoPagoWebhookSignature(unsigned, { data: { id: 'payment-fixture-1' } }))
      .toEqual({ configured: true, ok: false, reason: 'missing_signature_parts' })
    expect(verifyMercadoPagoWebhookSignature(signedRequest({}), null))
      .toEqual({ configured: true, ok: false, reason: 'missing_signature_parts' })
  })

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
