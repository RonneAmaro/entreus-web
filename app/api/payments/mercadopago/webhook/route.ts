import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { verifyVipPaymentForActivation } from '@/lib/vip-payment-verification'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'

type MercadoPagoPayment = {
  id?: number | string
  status?: string
  transaction_amount?: number
  currency_id?: string
  external_reference?: string
  payment_method_id?: string
  payment_type_id?: string
  metadata?: {
    order_id?: string
    product_type?: string
    payment_method_option?: string
    plan_key?: string
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

type PaymentOrderForVerification = {
  id: string
  product_type: string
  product_id: string | null
  total_brl_cents: number
  metadata: Record<string, unknown> | null
  provider_preference_id: string | null
  processed_at: string | null
}

const PAYMENT_EVENT_TYPES = new Set(['payment'])
const MERCHANT_ORDER_EVENT_TYPES = new Set(['merchant_order'])
const PENDING_PAYMENT_STATUSES = new Set(['pending', 'in_process', 'authorized'])
const FINAL_NOT_APPROVED_PAYMENT_STATUSES = new Set(['rejected', 'cancelled', 'canceled', 'expired'])

export function isProductionEnvironment() {
  return process.env.NODE_ENV === 'production'
}

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

function parseMercadoPagoSignatureHeader(value: string | null) {
  if (!value) return null

  return value.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=')
    const cleanKey = key?.trim()
    const cleanValue = rest.join('=').trim()

    if (cleanKey && cleanValue) acc[cleanKey] = cleanValue
    return acc
  }, {})
}

function getSignatureDataId(request: Request, body: unknown) {
  const url = new URL(request.url)
  const queryDataId = url.searchParams.get('data.id') || url.searchParams.get('id')

  if (queryDataId) return queryDataId.toLowerCase()

  if (body && typeof body === 'object') {
    const record = body as MercadoPagoWebhookPayload
    const bodyDataId = record.data?.id || record.id
    if (bodyDataId) return String(bodyDataId).toLowerCase()
  }

  return ''
}

function safeTimingCompareHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false

  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')

  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function verifyMercadoPagoWebhookSignature(request: Request, body: unknown) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()

  if (!secret) {
    return {
      configured: false,
      ok: !isProductionEnvironment(),
      reason: isProductionEnvironment()
        ? 'signature_secret_required_in_production'
        : 'signature_secret_not_configured',
    }
  }

  const signatureParts = parseMercadoPagoSignatureHeader(request.headers.get('x-signature'))
  const requestId = request.headers.get('x-request-id')?.trim() || ''
  const dataId = getSignatureDataId(request, body)
  const timestamp = signatureParts?.ts || ''
  const receivedSignature = signatureParts?.v1 || ''

  if (!signatureParts || !requestId || !dataId || !timestamp || !receivedSignature) {
    return {
      configured: true,
      ok: false,
      reason: 'missing_signature_parts',
    }
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')

  return {
    configured: true,
    ok: safeTimingCompareHex(expectedSignature, receivedSignature),
    reason: 'signature_checked',
  }
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

async function getPaymentOrderForVerification(
  supabase: ReturnType<typeof getServiceSupabase>,
  externalReference: string | null,
  orderId: string | null,
) {
  const select = 'id, product_type, product_id, total_brl_cents, metadata, provider_preference_id, processed_at'

  if (externalReference) {
    const byReference = await supabase
      .from('payment_orders')
      .select(select)
      .eq('external_reference', externalReference)
      .maybeSingle()

    if (byReference.error || byReference.data || !orderId) return byReference
  }

  if (orderId) {
    return supabase
      .from('payment_orders')
      .select(select)
      .eq('id', orderId)
      .maybeSingle()
  }

  return { data: null, error: null }
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

function getSafeRpcResultLog(data: unknown) {
  if (!data || typeof data !== 'object') return null

  const record = data as Record<string, unknown>
  return {
    success: typeof record.success === 'boolean' ? record.success : null,
    paid: typeof record.paid === 'boolean' ? record.paid : null,
    alreadyProcessed: typeof record.already_processed === 'boolean' ? record.already_processed : null,
    credited: typeof record.credited === 'boolean' ? record.credited : null,
    vipActivated: typeof record.vip_activated === 'boolean' ? record.vip_activated : null,
    reason: typeof record.reason === 'string' ? record.reason : null,
    productType: typeof record.product_type === 'string' ? record.product_type : null,
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

  // CORREÇÃO: Extrai o orderId primeiro e garante o fallback caso o external_reference principal venha nulo
  const orderId = getSafeOrderId(payment.metadata?.order_id)
  const externalReference = payment.external_reference || merchantOrder?.external_reference || orderId || null
  const paymentExternalReference = externalReference ?? null
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

  if (providerStatus === 'approved') {
    const orderLookup = await getPaymentOrderForVerification(supabase, paymentExternalReference, orderId)

    if (orderLookup.error) {
      console.error('Mercado Pago nao conseguiu validar o pedido antes da ativacao VIP.', {
        code: orderLookup.error.code,
        paymentId: providerPaymentId,
      })
      return NextResponse.json({ ok: false, reason: 'order_validation_error', paymentId: providerPaymentId }, { status: 500 })
    }

    const order = orderLookup.data as PaymentOrderForVerification | null

    if (order?.product_type === 'vip_plus') {
      const metadata = order.metadata || {}
      const verification = verifyVipPaymentForActivation(
        {
          productType: order.product_type,
          planKey: order.product_id,
          totalBrlCents: order.total_brl_cents,
          paymentMethodOption:
            typeof metadata.payment_method_option === 'string' ? metadata.payment_method_option : null,
          providerPreferenceId: order.provider_preference_id,
          processedAt: order.processed_at,
        },
        {
          status: providerStatus,
          transactionAmount: payment.transaction_amount ?? null,
          currencyId: payment.currency_id ?? null,
          metadata: {
            productType: payment.metadata?.product_type ?? null,
            planKey: payment.metadata?.plan_key ?? null,
          },
          providerPreferenceId: merchantOrder?.preference_id || null,
        },
      )

      if (!verification.valid) {
        console.warn('Mercado Pago pagamento VIP ignorado por validacao.', {
          paymentId: providerPaymentId,
          orderId: order.id,
          reason: verification.reason,
        })
        return NextResponse.json({
          ok: true,
          received: true,
          ignored: true,
          reason: 'vip_payment_validation_failed',
          paymentId: providerPaymentId,
        })
      }
    }
  }

  let { data, error } = await supabase.rpc('complete_mercadopago_payment_order_v2', {
    p_provider_payment_id: providerPaymentId,
    p_provider_status: providerStatus,
    p_external_reference: paymentExternalReference,
    p_metadata: {
      provider: 'mercadopago',
      origin: 'mercadopago_webhook',
      provider_payment_id: providerPaymentId,
      provider_status: providerStatus,
      provider_payment_method: providerPaymentMethod,
      external_reference: paymentExternalReference,
      metadata_order_id: orderId,
      provider_order_id: payment.order?.id ? String(payment.order.id) : null,
      provider_preference_id: preferenceId,
    },
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
      result: getSafeRpcResultLog(data),
    })

    return NextResponse.json({
      ok: true,
      received: true,
      processed: true,
      paymentId: providerPaymentId,
      result: getSafeRpcResultLog(data),
    })
  }

  if (PENDING_PAYMENT_STATUSES.has(providerStatus)) {
    console.info('Mercado Pago pagamento ainda nao aprovado', {
      paymentId: providerPaymentId,
      status: providerStatus,
      result: getSafeRpcResultLog(data),
    })

    return NextResponse.json({
      ok: true,
      received: true,
      pending: true,
      paymentId: providerPaymentId,
      status: providerStatus,
      result: getSafeRpcResultLog(data),
    })
  }

  if (FINAL_NOT_APPROVED_PAYMENT_STATUSES.has(providerStatus)) {
    console.info('Mercado Pago pagamento ainda nao aprovado', {
      paymentId: providerPaymentId,
      status: providerStatus,
      result: getSafeRpcResultLog(data),
    })

    return NextResponse.json({
      ok: true,
      received: true,
      ignored: true,
      reason: 'payment_not_approved',
      paymentId: providerPaymentId,
      status: providerStatus,
      result: getSafeRpcResultLog(data),
    })
  }

  console.info('Mercado Pago pagamento ainda nao aprovado', {
    paymentId: providerPaymentId,
    status: providerStatus,
    result: getSafeRpcResultLog(data),
  })

  return NextResponse.json({
    ok: true,
    received: true,
    ignored: true,
    reason: 'payment_status_not_approved',
    paymentId: providerPaymentId,
    status: providerStatus,
    result: getSafeRpcResultLog(data),
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
  const requestId = getRequestCorrelationId(request)
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'Mercado Pago nao configurado.' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const eventType = getWebhookEvent(request, body)
    const resourceId = getResourceId(request, body)
    const signature = verifyMercadoPagoWebhookSignature(request, body)

    if (!signature.ok) {
      logServerEvent('warn', {
        event: 'mercadopago_webhook.invalid_signature',
        requestId,
        context: {
          reason: signature.reason,
          eventType,
          hasResourceId: Boolean(resourceId),
        },
      })

      return NextResponse.json(
        { ok: false, ignored: true, reason: 'invalid_webhook_signature' },
        { status: 401 },
      )
    }

    logServerEvent('info', {
      event: 'mercadopago_webhook.received',
      requestId,
      context: {
        eventType,
        action: body && typeof body === 'object' ? (body as MercadoPagoWebhookPayload).action || null : null,
        topic: body && typeof body === 'object' ? (body as MercadoPagoWebhookPayload).topic || null : null,
        liveMode: body && typeof body === 'object' ? (body as MercadoPagoWebhookPayload).live_mode ?? null : null,
        resourceId,
        signatureConfigured: signature.configured,
      },
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
    logServerEvent('error', {
      event: 'mercadopago_webhook.unexpected_error',
      requestId,
      error,
    })

    return NextResponse.json(
      { ok: false, error: 'Erro interno controlado no webhook Mercado Pago.' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
