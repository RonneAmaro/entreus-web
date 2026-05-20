import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type MercadoPagoPayment = {
  id?: number | string
  status?: string
  external_reference?: string
  payment_method_id?: string
  payment_type_id?: string
  metadata?: {
    order_id?: string
    product_type?: string
    payment_method_option?: string
    user_id?: string
  } | null
  order?: {
    id?: number | string
    type?: string
  } | null
  message?: string
}

type MercadoPagoMerchantOrder = {
  id?: number | string
  external_reference?: string
  preference_id?: string
  payments?: {
    id?: number | string
    status?: string
  }[]
  message?: string
}

type MercadoPagoWebhookPayload = {
  action?: string
  type?: string
  topic?: string
  live_mode?: boolean
  data?: {
    id?: number | string
  } | null
  id?: number | string
}

type ProcessPaymentResult = {
  ok: boolean
  paymentId: string
  ignored?: boolean
  pending?: boolean
  processed?: boolean
  reason?: string
  status?: string
  result?: unknown
}

const PAYMENT_EVENT_TYPES = new Set(['payment'])
const MERCHANT_ORDER_EVENT_TYPES = new Set(['merchant_order'])
const PENDING_PAYMENT_STATUSES = new Set(['pending', 'in_process', 'authorized'])
const FINAL_NOT_APPROVED_PAYMENT_STATUSES = new Set(['rejected', 'cancelled', 'canceled', 'expired'])

function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role environment variables are missing.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function getWebhookEvent(request: Request, body: unknown) {
  const url = new URL(request.url)
  const queryTopic = url.searchParams.get('topic') || url.searchParams.get('type')

  if (queryTopic) return queryTopic

  if (body && typeof body === 'object') {
    const record = body as MercadoPagoWebhookPayload
    const action = record.action || ''
    return String(record.type || record.topic || action.split('.')[0] || '')
  }

  return ''
}

function getResourceId(request: Request, body: unknown) {
  const url = new URL(request.url)
  const queryId = url.searchParams.get('data.id') || url.searchParams.get('id')

  if (queryId) return queryId

  if (body && typeof body === 'object') {
    const record = body as MercadoPagoWebhookPayload
    const data = record.data || undefined
    return String(data?.id || record.id || '')
  }

  return ''
}

async function fetchMercadoPagoJson<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const data = (await response.json().catch(() => null)) as T | null
  return { response, data }
}

function getSafeOrderId(value: unknown) {
  if (!value || typeof value !== 'string') return null

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidPattern.test(value) ? value : null
}

function isPaymentEvent(eventType: string, body: unknown) {
  if (PAYMENT_EVENT_TYPES.has(eventType)) return true

  if (body && typeof body === 'object') {
    const record = body as MercadoPagoWebhookPayload
    return Boolean(record.action?.startsWith('payment.'))
  }

  return false
}

function isMerchantOrderEvent(eventType: string) {
  return MERCHANT_ORDER_EVENT_TYPES.has(eventType)
}

function getProviderPreferenceId(payment: MercadoPagoPayment, merchantOrder: MercadoPagoMerchantOrder | null) {
  return merchantOrder?.preference_id || (payment.order?.type === 'mercadopago' ? String(payment.order.id || '') : null) || null
}

function getRpcErrorLog(error: {
  message?: string
  code?: string
  details?: string
  hint?: string
}) {
  return {
    message: error.message || null,
    code: error.code || null,
    details: error.details || null,
    hint: error.hint || null,
  }
}

function getFetchFailureResult(paymentId: string, status: number, message?: string | null) {
  console.info('Mercado Pago payment fetch failed', {
    paymentId,
    status,
    message: message || null,
  })

  if (status === 404) {
    console.info('Mercado Pago pagamento nao encontrado', {
      paymentId,
      status,
    })

    return NextResponse.json(
      { ok: false, ignored: true, reason: 'payment_not_found', paymentId },
      { status: 200 }
    )
  }

  if (status === 401 || status === 403) {
    console.info('Mercado Pago credencial sem acesso ao pagamento', {
      paymentId,
      status,
    })

    return NextResponse.json(
      { ok: false, ignored: true, reason: 'payment_access_denied', paymentId },
      { status: 200 }
    )
  }

  return NextResponse.json(
    { ok: false, error: message || 'Falha ao buscar pagamento Mercado Pago.', paymentId, status },
    { status: 500 }
  )
}

async function processPaymentId(
  paymentId: string,
  accessToken: string,
  merchantOrder: MercadoPagoMerchantOrder | null = null
) {
  const { response: paymentResponse, data: payment } =
    await fetchMercadoPagoJson<MercadoPagoPayment>(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      accessToken
    )

  if (!paymentResponse.ok || !payment?.id) {
    return getFetchFailureResult(paymentId, paymentResponse.status, payment?.message)
  }

  if (!merchantOrder && !payment.external_reference && payment.order?.id) {
    const merchantOrderResult = await fetchMercadoPagoJson<MercadoPagoMerchantOrder>(
      `https://api.mercadopago.com/merchant_orders/${payment.order.id}`,
      accessToken
    )

    if (merchantOrderResult.response.ok && merchantOrderResult.data) {
      merchantOrder = merchantOrderResult.data
    } else if ([401, 403, 404].includes(merchantOrderResult.response.status)) {
      console.info('Mercado Pago merchant_order ignorada ao complementar pagamento.', {
        paymentId: String(payment.id || paymentId),
        merchantOrderId: String(payment.order.id),
        status: merchantOrderResult.response.status,
      })
    }
  }

  const externalReference = payment.external_reference || merchantOrder?.external_reference || null
  const paymentExternalReference = payment.external_reference ?? null
  const orderId = getSafeOrderId(payment.metadata?.order_id)
  const preferenceId = getProviderPreferenceId(payment, merchantOrder)
  const providerStatus = payment.status || 'unknown'
  const providerPaymentId = String(payment.id || paymentId)
  const providerPaymentMethod = payment.payment_method_id ?? payment.payment_type_id ?? null

  console.info('Mercado Pago pagamento recebido', {
    paymentId: providerPaymentId,
    status: providerStatus,
    externalReference,
    orderId,
    providerPreferenceId: preferenceId,
    paymentMethod: providerPaymentMethod,
  })

  const supabase = getServiceSupabase()
  let { data, error } = await supabase.rpc('complete_mercadopago_payment_order_v2', {
    p_provider_payment_id: providerPaymentId,
    p_provider_status: providerStatus,
    p_external_reference: paymentExternalReference,
    p_order_id: orderId ?? null,
    p_provider_preference_id: preferenceId ?? null,
    p_provider_payment_method: providerPaymentMethod,
  })

  if (error && paymentExternalReference) {
    console.info('Tentando fallback da RPC antiga de Mercado Pago.', {
      paymentId: providerPaymentId,
      externalReference: paymentExternalReference,
    })

    const fallbackResult = await supabase.rpc('complete_mercadopago_payment_order', {
      p_external_reference: paymentExternalReference,
      p_provider_payment_id: providerPaymentId,
      p_provider_status: providerStatus,
    })

    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) {
    console.error('Mercado Pago RPC error', {
      ...getRpcErrorLog(error),
      paymentId: providerPaymentId,
      status: providerStatus,
      external_reference: paymentExternalReference,
      orderId,
      provider_preference_id: preferenceId,
    })

    return NextResponse.json(
      { ok: false, reason: 'rpc_error', paymentId: providerPaymentId },
      { status: 500 }
    )
  }

  if (providerStatus === 'approved') {
    console.info('Mercado Pago pagamento processado', {
      paymentId: providerPaymentId,
      status: providerStatus,
      result: data,
    })

    return NextResponse.json({
      ok: true,
      received: true,
      processed: true,
      paymentId: providerPaymentId,
      result: data,
    })
  }

  if (PENDING_PAYMENT_STATUSES.has(providerStatus)) {
    console.info('Mercado Pago pagamento ainda nao aprovado', {
      paymentId: providerPaymentId,
      status: providerStatus,
      result: data,
    })

    return NextResponse.json({
      ok: true,
      received: true,
      pending: true,
      paymentId: providerPaymentId,
      status: providerStatus,
      result: data,
    })
  }

  if (FINAL_NOT_APPROVED_PAYMENT_STATUSES.has(providerStatus)) {
    console.info('Mercado Pago pagamento ainda nao aprovado', {
      paymentId: providerPaymentId,
      status: providerStatus,
      result: data,
    })

    return NextResponse.json({
      ok: true,
      received: true,
      ignored: true,
      reason: 'payment_not_approved',
      paymentId: providerPaymentId,
      status: providerStatus,
      result: data,
    })
  }

  console.info('Mercado Pago pagamento ainda nao aprovado', {
    paymentId: providerPaymentId,
    status: providerStatus,
    result: data,
  })

  return NextResponse.json({
    ok: true,
    received: true,
    ignored: true,
    reason: 'payment_status_not_approved',
    paymentId: providerPaymentId,
    status: providerStatus,
    result: data,
  })
}

async function processMerchantOrder(resourceId: string, accessToken: string) {
  const merchantOrderResult = await fetchMercadoPagoJson<MercadoPagoMerchantOrder>(
    `https://api.mercadopago.com/merchant_orders/${resourceId}`,
    accessToken
  )

  const merchantOrder = merchantOrderResult.data

  if (!merchantOrderResult.response.ok) {
    const status = merchantOrderResult.response.status

    console.info('Mercado Pago merchant_order fetch failed', {
      resourceId,
      status,
      message: merchantOrder?.message || null,
    })

    if (status === 404) {
      return NextResponse.json(
        { ok: false, ignored: true, reason: 'merchant_order_not_found', resourceId },
        { status: 200 }
      )
    }

    if (status === 401 || status === 403) {
      return NextResponse.json(
        { ok: false, ignored: true, reason: 'merchant_order_access_denied', resourceId },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { ok: false, error: merchantOrder?.message || 'Falha ao buscar merchant_order Mercado Pago.', resourceId, status },
      { status: 500 }
    )
  }

  if (!merchantOrder?.payments?.length) {
    console.info('Mercado Pago merchant_order ignorada: sem pagamentos.', {
      resourceId,
      status: merchantOrderResult.response.status,
    })

    return NextResponse.json({ ok: true, received: true, ignored: true, reason: 'merchant_order_without_payments' })
  }

  const results: ProcessPaymentResult[] = []

  for (const item of merchantOrder.payments) {
    const paymentId = String(item.id || '')

    if (!paymentId) continue

    const response = await processPaymentId(paymentId, accessToken, merchantOrder)
    const result = (await response.json()) as ProcessPaymentResult
    results.push(result)
  }

  return NextResponse.json({
    ok: results.some((result) => result.ok),
    received: true,
    processed: results.some((result) => result.processed),
    pending: results.some((result) => result.pending),
    ignored: results.every((result) => result.ignored),
    results,
  })
}

export async function POST(request: Request) {
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'Mercado Pago nao configurado.' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const eventType = getWebhookEvent(request, body)
    const resourceId = getResourceId(request, body)

    console.info('Mercado Pago webhook recebido', {
      eventType,
      action: body && typeof body === 'object' ? (body as MercadoPagoWebhookPayload).action || null : null,
      topic: body && typeof body === 'object' ? (body as MercadoPagoWebhookPayload).topic || null : null,
      liveMode: body && typeof body === 'object' ? (body as MercadoPagoWebhookPayload).live_mode ?? null : null,
      resourceId,
    })

    if (!resourceId) {
      console.info('Mercado Pago webhook ignorado: sem resource id.')
      return NextResponse.json({ ok: true, received: true, ignored: true, reason: 'missing_resource_id' })
    }

    if (isMerchantOrderEvent(eventType)) {
      return await processMerchantOrder(resourceId, accessToken)
    }

    if (isPaymentEvent(eventType, body)) {
      return await processPaymentId(resourceId, accessToken)
    }

    console.info('Mercado Pago webhook ignorado: evento nao suportado.', {
      eventType,
      resourceId,
    })

    return NextResponse.json({ ok: true, received: true, ignored: true, reason: 'unsupported_event', eventType })
  } catch (error) {
    console.error('Erro no webhook Mercado Pago:', error)

    return NextResponse.json(
      { ok: false, error: 'Erro interno controlado no webhook Mercado Pago.' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
