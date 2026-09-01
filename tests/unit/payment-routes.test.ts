import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  paymentInsert: vi.fn(),
  paymentUpdate: vi.fn(),
  paymentSelect: vi.fn(),
  paymentEq: vi.fn(),
  paymentSingle: vi.fn(),
  paymentMaybeSingle: vi.fn(),
  storageList: vi.fn(),
  log: vi.fn(),
  qr: vi.fn(),
}))

const paymentBuilder = {
  insert: mocks.paymentInsert,
  update: mocks.paymentUpdate,
  select: mocks.paymentSelect,
  eq: mocks.paymentEq,
  single: mocks.paymentSingle,
  maybeSingle: mocks.paymentMaybeSingle,
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: vi.fn((table: string) => table === 'payment_orders' ? paymentBuilder : { insert: mocks.insert }),
    storage: { from: vi.fn(() => ({ list: mocks.storageList })) },
  })),
}))
vi.mock('@/lib/logging/safe-logger', () => ({
  getRequestCorrelationId: () => 'request-test-id',
  logServerEvent: mocks.log,
}))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.qr } }))

import * as createPreference from '@/app/api/payments/mercadopago/create-preference/route'
import * as createPix from '@/app/api/payments/mercadopago/create-pix/route'
import * as manualInfo from '@/app/api/payments/pix/manual-info/route'
import * as manualCode from '@/app/api/payments/pix/manual-code/route'
import * as manualRequest from '@/app/api/payments/pix/manual-request/route'

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'payer@example.invalid' }
const requestId = '22222222-2222-4222-8222-222222222222'
const safeEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key',
  MERCADO_PAGO_ACCESS_TOKEN: 'test-access-token',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
  MERCADO_PAGO_NOTIFICATION_URL: 'https://hooks.entreus.vercel.app/mp',
  MERCADO_PAGO_RETURN_BASE_URL: 'https://entreus.vercel.app',
  NEXT_PUBLIC_SITE_URL: 'https://fallback.entreus.vercel.app',
  PIX_KEY: 'pix@example.invalid',
  PIX_RECEIVER_NAME: 'EntreUS',
  PIX_RECEIVER_CITY: 'Manaus',
}

function post(path: string, body: Record<string, unknown> = {}) {
  return new Request(`https://entreus.vercel.app${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test-session', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function order(productType: 'itacash' | 'vip_plus' = 'itacash') {
  return { id: requestId, external_reference: 'ORDER-TEST', product_type: productType, amount_itacash: 100, total_brl_cents: 1030 }
}

beforeEach(() => {
  vi.restoreAllMocks()
  mocks.getUser.mockReset()
  mocks.rpc.mockReset()
  mocks.insert.mockReset()
  mocks.paymentInsert.mockReset().mockReturnValue(paymentBuilder)
  mocks.paymentUpdate.mockReset().mockReturnValue(paymentBuilder)
  mocks.paymentSelect.mockReset().mockReturnValue(paymentBuilder)
  mocks.paymentEq.mockReset().mockReturnValue(paymentBuilder)
  mocks.paymentSingle.mockReset()
  mocks.paymentMaybeSingle.mockReset()
  mocks.storageList.mockReset()
  mocks.log.mockReset()
  mocks.qr.mockReset()
  for (const [name, value] of Object.entries(safeEnv)) vi.stubEnv(name, value)
  mocks.getUser.mockResolvedValue({ data: { user }, error: null })
  mocks.insert.mockResolvedValue({ error: null })
  mocks.storageList.mockResolvedValue({ data: [{ name: 'proof.png' }], error: null })
  mocks.qr.mockResolvedValue('data:image/png;base64,c2FmZQ==')
  vi.stubGlobal('fetch', vi.fn())
})

describe('POST create-preference', () => {
  it('rejects missing token/configuration before network access', async () => {
    vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '')
    const response = await createPreference.POST(post('/api/payments/mercadopago/create-preference'))
    expect(response.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['http://entreus.vercel.app', safeEnv.MERCADO_PAGO_RETURN_BASE_URL],
    ['https://localhost/callback', safeEnv.MERCADO_PAGO_RETURN_BASE_URL],
    [safeEnv.MERCADO_PAGO_NOTIFICATION_URL, 'https://192.168.1.2'],
  ])('rejects unsafe public URL before provider call', async (notification, returnBase) => {
    vi.stubEnv('MERCADO_PAGO_NOTIFICATION_URL', notification)
    vi.stubEnv('MERCADO_PAGO_RETURN_BASE_URL', returnBase)
    const response = await createPreference.POST(post('/api/payments/mercadopago/create-preference', { product_type: 'vip_plus', plan_key: 'vip_30d' }))
    expect(response.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated users and invalid VIP plans', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid token') })
    const unauthenticated = await createPreference.POST(post('/api/payments/mercadopago/create-preference', { product_type: 'vip_plus', plan_key: 'vip_30d' }))
    expect(unauthenticated.status).toBe(401)
    expect((await unauthenticated.json()).code).toBe('authentication_rejected')
    const invalidPlan = await createPreference.POST(post('/api/payments/mercadopago/create-preference', { product_type: 'vip_plus', plan_key: 'vip_unknown' }))
    expect(invalidPlan.status).toBe(400)
  })

  it('handles internal order and provider failures safely', async () => {
    mocks.paymentSingle.mockResolvedValueOnce({ data: null, error: new Error('database details') })
    const orderFailure = await createPreference.POST(post('/api/payments/mercadopago/create-preference', { product_type: 'vip_plus', plan_key: 'vip_30d' }))
    expect(orderFailure.status).toBe(400)
    expect(await orderFailure.text()).not.toContain('database details')

    mocks.paymentSingle.mockResolvedValueOnce({ data: order('vip_plus'), error: null })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'provider private detail' }), { status: 400 }))
    const providerFailure = await createPreference.POST(post('/api/payments/mercadopago/create-preference', { product_type: 'vip_plus', plan_key: 'vip_30d' }))
    expect(providerFailure.status).toBe(502)
    expect(await providerFailure.text()).not.toContain('provider private detail')
  })

  it('prefers explicit notification/return URLs and returns only a safe checkout URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    mocks.paymentSingle.mockResolvedValueOnce({ data: order('vip_plus'), error: null })
    mocks.paymentMaybeSingle.mockResolvedValueOnce({ data: { id: requestId }, error: null })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pref-test', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test' }), { status: 200 }))
    const response = await createPreference.POST(post('/api/payments/mercadopago/create-preference', { product_type: 'vip_plus', plan_key: 'vip_30d' }))
    expect(response.status).toBe(200)
    const providerBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
    const insertedOrder = mocks.paymentInsert.mock.calls[0][0]
    expect(providerBody.notification_url).toBe(safeEnv.MERCADO_PAGO_NOTIFICATION_URL)
    expect(providerBody.back_urls.success).toMatch(new RegExp(`^${safeEnv.MERCADO_PAGO_RETURN_BASE_URL}`))
    expect(insertedOrder).toMatchObject({
      user_id: user.id,
      product_type: 'vip_plus',
      product_id: 'vip_30d',
      base_amount_brl_cents: 1990,
      total_brl_cents: 2050,
    })
    expect(vi.mocked(createClient).mock.calls.some((call) => call[1] === safeEnv.SUPABASE_SERVICE_ROLE_KEY)).toBe(true)
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(safeEnv.MERCADO_PAGO_ACCESS_TOKEN)
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(user.email)
  })

  it('reaches the mocked provider with both explicit URLs and a localhost site URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    mocks.paymentSingle.mockResolvedValueOnce({ data: order('vip_plus'), error: null })
    mocks.paymentMaybeSingle.mockResolvedValueOnce({ data: { id: requestId }, error: null })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pref-runtime', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=runtime' }), { status: 200 }))
    const response = await createPreference.POST(post('/api/payments/mercadopago/create-preference', { product_type: 'vip_plus', plan_key: 'vip_30d' }))
    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('POST create-pix', () => {
  it('rejects invalid notification URL, invalid amount and unauthenticated user without provider access', async () => {
    vi.stubEnv('MERCADO_PAGO_NOTIFICATION_URL', 'https://10.0.0.2/webhook')
    expect((await createPix.POST(post('/api/payments/mercadopago/create-pix', { amount_itacash: 100 }))).status).toBe(503)
    vi.stubEnv('MERCADO_PAGO_NOTIFICATION_URL', safeEnv.MERCADO_PAGO_NOTIFICATION_URL)
    expect((await createPix.POST(post('/api/payments/mercadopago/create-pix', { amount_itacash: 0 }))).status).toBe(400)
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('expired') })
    expect((await createPix.POST(post('/api/payments/mercadopago/create-pix', { amount_itacash: 100 }))).status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('handles order, missing QR and persistence failures', async () => {
    mocks.paymentSingle.mockResolvedValueOnce({ data: null, error: new Error('db') })
    expect((await createPix.POST(post('/api/payments/mercadopago/create-pix', { amount_itacash: 100 }))).status).toBe(400)

    mocks.paymentSingle.mockResolvedValueOnce({ data: order(), error: null })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pay-test' }), { status: 200 }))
    expect((await createPix.POST(post('/api/payments/mercadopago/create-pix', { amount_itacash: 100 }))).status).toBe(502)

    mocks.paymentSingle.mockResolvedValueOnce({ data: order(), error: null })
    mocks.paymentMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('attach') })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pay-test', point_of_interaction: { transaction_data: { qr_code: 'safe-br-code' } } }), { status: 200 }))
    expect((await createPix.POST(post('/api/payments/mercadopago/create-pix', { amount_itacash: 100 }))).status).toBe(500)
  })

  it('returns automatic QR and never logs secrets', async () => {
    mocks.paymentSingle.mockResolvedValueOnce({ data: order(), error: null })
    mocks.paymentMaybeSingle.mockResolvedValueOnce({ data: { id: requestId }, error: null })
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'pay-test', status: 'pending', point_of_interaction: { transaction_data: { qr_code: 'safe-br-code', qr_code_base64: 'c2FmZQ==' } } }), { status: 200 }))
    const response = await createPix.POST(post('/api/payments/mercadopago/create-pix', { amount_itacash: 100 }))
    expect(response.status).toBe(200)
    expect((await response.json()).qr_code).toBe('safe-br-code')
    expect(mocks.paymentInsert.mock.calls[0][0]).toMatchObject({
      user_id: user.id,
      product_type: 'itacash',
      amount_itacash: 100,
      base_amount_brl_cents: 1000,
      total_brl_cents: 1030,
    })
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(safeEnv.MERCADO_PAGO_ACCESS_TOKEN)
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(user.email)
  })
})

describe('GET manual-info', () => {
  const infoRequest = () => new Request('https://entreus.vercel.app/api/payments/pix/manual-info', { headers: { authorization: 'Bearer test-session' } })
  it('requires authentication', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('expired') })
    const response = await manualInfo.GET(new Request('https://entreus.vercel.app/api/payments/pix/manual-info'))
    expect(response.status).toBe(401)
    expect((await response.json()).code).toBe('authentication_required')
  })

  it('reports absent/present configuration without logging the Pix key', async () => {
    vi.stubEnv('PIX_KEY', '')
    const absentResponse = await manualInfo.GET(infoRequest())
    expect(absentResponse.status).toBe(200)
    const absent = await absentResponse.json()
    expect(absent.configured).toBe(false)
    expect(absent.diagnostic).toMatchObject({ key_present: false, valid: false, code: 'pix_configuration_missing' })
    vi.stubEnv('PIX_KEY', safeEnv.PIX_KEY)
    const presentResponse = await manualInfo.GET(infoRequest())
    expect(presentResponse.status).toBe(200)
    const present = await presentResponse.json()
    expect(present.configured).toBe(true)
    expect(present.diagnostic).toMatchObject({ key_present: true, key_type: 'email', valid: true, code: null })
    expect(present.pix_key).toBeUndefined()
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(safeEnv.PIX_KEY)
  })
})

describe('POST manual-code', () => {
  it.each([['vip_30d', 1990], ['vip_90d', 4990], ['vip_365d', 14990]])('generates BR Code and QR for %s with server total', async (planKey, expectedTotal) => {
    const response = await manualCode.POST(post('/api/payments/pix/manual-code', { product_type: 'vip_plus', plan_key: planKey, total_brl_cents: 1 }))
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.total_brl_cents).toBe(expectedTotal)
    expect(data.pix_copy_paste).toMatch(/^000201/)
    expect(data.qr_code_data_url).toMatch(/^data:image\/png/)
  })

  it('calculates ItaCash total server-side and ignores a client total', async () => {
    const response = await manualCode.POST(post('/api/payments/pix/manual-code', { product_type: 'itacash', amount_itacash: 100, total_brl_cents: 1 }))
    expect((await response.json()).total_brl_cents).toBe(1000)
  })

  it('reports generation failures separately from missing configuration', async () => {
    mocks.qr.mockRejectedValueOnce(new Error('encoder failed'))
    const response = await manualCode.POST(post('/api/payments/pix/manual-code', { product_type: 'vip_plus', plan_key: 'vip_30d' }))
    expect(response.status).toBe(500)
    expect((await response.json()).code).toBe('pix_generation_failed')
  })

  it('rejects invalid amount, missing configuration and unauthenticated user', async () => {
    expect((await manualCode.POST(post('/api/payments/pix/manual-code', { product_type: 'itacash', amount_itacash: 0 }))).status).toBe(400)
    vi.stubEnv('PIX_KEY', '')
    expect((await manualCode.POST(post('/api/payments/pix/manual-code', { product_type: 'itacash', amount_itacash: 100 }))).status).toBe(503)
    vi.stubEnv('PIX_KEY', safeEnv.PIX_KEY)
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const rejected = await manualCode.POST(post('/api/payments/pix/manual-code', { product_type: 'itacash', amount_itacash: 100 }))
    expect(rejected.status).toBe(401)
    expect((await rejected.json()).code).toBe('authentication_rejected')
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(safeEnv.PIX_KEY)
  })
})

describe('POST manual-request', () => {
  const validBody = { amount_itacash: 100, request_id: requestId, proof_path: `${user.id}/${requestId}/proof.png`, user_note: 'test note' }

  it('rejects unauthenticated users and malformed request data', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('expired') })
    expect((await manualRequest.POST(post('/api/payments/pix/manual-request', validBody))).status).toBe(401)
    expect((await manualRequest.POST(post('/api/payments/pix/manual-request', { ...validBody, amount_itacash: 0 }))).status).toBe(400)
    expect((await manualRequest.POST(post('/api/payments/pix/manual-request', { ...validBody, request_id: 'bad-id' }))).status).toBe(400)
  })

  it.each([
    `${requestId}/${requestId}/proof.png`,
    `${user.id}/${requestId}/../proof.png`,
    `${user.id}/${requestId}/proof.exe`,
  ])('rejects foreign, traversal or invalid proof path %s', async (proofPath) => {
    expect((await manualRequest.POST(post('/api/payments/pix/manual-request', { ...validBody, proof_path: proofPath }))).status).toBe(400)
  })

  it('requires the uploaded object to exist', async () => {
    mocks.storageList.mockResolvedValueOnce({ data: [], error: null })
    expect((await manualRequest.POST(post('/api/payments/pix/manual-request', validBody))).status).toBe(400)
  })

  it('ignores financial extras and inserts server-side totals', async () => {
    const response = await manualRequest.POST(post('/api/payments/pix/manual-request', {
      ...validBody, total_brl_cents: 1, platform_fee_percent: 99, pix_key_snapshot: 'attacker-value',
    }))
    expect(response.status).toBe(200)
    const inserted = mocks.insert.mock.calls[0][0]
    expect(inserted).toMatchObject({ amount_itacash: 100, base_amount_brl_cents: 1000, platform_fee_percent: 0, platform_fee_brl_cents: 0, operator_fee_percent: 0, operator_fee_brl_cents: 0, total_brl_cents: 1000, pix_total_brl_cents: 1000 })
    expect(inserted.pix_key_snapshot).toBe(safeEnv.PIX_KEY)
    expect((await response.json())).toEqual({ request_id: requestId, amount_itacash: 100, total_brl_cents: 1000, status: 'pending' })
  })

  it('returns a safe database error and logs no Pix key or full proof path', async () => {
    mocks.insert.mockResolvedValueOnce({ error: new Error('database private detail') })
    const response = await manualRequest.POST(post('/api/payments/pix/manual-request', validBody))
    expect(response.status).toBe(500)
    const body = await response.text()
    expect(body).not.toContain('database private detail')
    const logs = JSON.stringify(mocks.log.mock.calls)
    expect(logs).not.toContain(safeEnv.PIX_KEY)
    expect(logs).not.toContain(validBody.proof_path)
  })
})
