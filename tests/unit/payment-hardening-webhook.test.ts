import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  log: vi.fn(),
}))

const query = {
  select: mocks.select,
  eq: mocks.eq,
  maybeSingle: mocks.maybeSingle,
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mocks.rpc,
    from: vi.fn(() => query),
  })),
}))

vi.mock('@/lib/logging/safe-logger', () => ({
  getRequestCorrelationId: () => 'webhook-hardening-test',
  logServerEvent: mocks.log,
}))

import { POST } from '@/app/api/payments/mercadopago/webhook/route'

function webhookRequest(paymentId: string, body: Record<string, unknown> = {}) {
  return new Request(`https://entreus.invalid/api/payments/mercadopago/webhook?type=payment&data.id=${paymentId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: { id: paymentId }, ...body }),
  })
}

function providerPayment(status: string) {
  return {
    id: 'provider-payment-1',
    status,
    external_reference: 'entreus_trusted_order',
    transaction_amount: 10.3,
    currency_id: 'BRL',
    payment_method_id: 'pix',
    metadata: { product_type: 'itacash' },
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', 'provider-test-token')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-only-service-key')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', '')
  mocks.rpc.mockReset()
  mocks.select.mockReset().mockReturnValue(query)
  mocks.eq.mockReset().mockReturnValue(query)
  mocks.maybeSingle.mockReset().mockResolvedValue({
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      product_type: 'itacash',
      product_id: null,
      total_brl_cents: 1030,
      metadata: { payment_method_option: 'mercadopago_pix' },
      provider_preference_id: null,
      processed_at: null,
    },
    error: null,
  })
  mocks.log.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

describe('trusted Mercado Pago completion path', () => {
  it('fetches provider state and completes through only the canonical V2 RPC', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(providerPayment('approved')), { status: 200 }))
    mocks.rpc.mockResolvedValueOnce({ data: { success: true, paid: true, credited: true }, error: null })

    const response = await POST(webhookRequest('provider-payment-1'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, processed: true })
    expect(fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/provider-payment-1',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'complete_mercadopago_payment_order_v2',
      expect.objectContaining({ p_provider_status: 'approved' }),
    )
  })

  it.each([
    ['pending', true, undefined],
    ['rejected', undefined, true],
  ])('trusts provider status %s instead of the webhook body', async (status, pending, ignored) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(providerPayment(status)), { status: 200 }))
    mocks.rpc.mockResolvedValueOnce({ data: { success: true, paid: false }, error: null })

    const response = await POST(webhookRequest('provider-payment-1', { status: 'approved' }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.ok).toBe(true)
    if (pending) expect(result.pending).toBe(true)
    if (ignored) expect(result.ignored).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'complete_mercadopago_payment_order_v2',
      expect.objectContaining({ p_provider_status: status }),
    )
  })
})
