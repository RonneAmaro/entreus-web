import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type MercadoPagoPayment = {
  id?: number | string
  status?: string
  external_reference?: string
  payment_method_id?: string
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
    const record = body as Record<string, unknown>
    return String(record.type || record.topic || record.action || '')
  }

  return ''
}

function getResourceId(request: Request, body: unknown) {
  const url = new URL(request.url)
  const queryId = url.searchParams.get('data.id') || url.searchParams.get('id')

  if (queryId) return queryId

  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    const data = record.data as Record<string, unknown> | undefined
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

export async function POST(request: Request) {
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN

    if (!accessToken) {
      return NextResponse.json({ error: 'Mercado Pago nao configurado.' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const eventType = getWebhookEvent(request, body)
    const resourceId = getResourceId(request, body)

    console.info('Mercado Pago webhook recebido', {
      eventType,
      resourceId,
    })

    if (!resourceId) {
      console.info('Mercado Pago webhook ignorado: sem resource id.')
      return NextResponse.json({ received: true, ignored: true })
    }

    let paymentId = resourceId
    let merchantOrder: MercadoPagoMerchantOrder | null = null

    if (eventType === 'merchant_order') {
      const merchantOrderResult = await fetchMercadoPagoJson<MercadoPagoMerchantOrder>(
        `https://api.mercadopago.com/merchant_orders/${resourceId}`,
        accessToken
      )

      merchantOrder = merchantOrderResult.data

      if (!merchantOrderResult.response.ok || !merchantOrder?.payments?.length) {
        console.info('Mercado Pago merchant_order ignorada: sem pagamentos.', {
          resourceId,
          status: merchantOrderResult.response.status,
        })

        return NextResponse.json({ received: true, ignored: true })
      }

      const approvedOrLatestPayment =
        merchantOrder.payments.find((item) => item.status === 'approved') ||
        merchantOrder.payments[merchantOrder.payments.length - 1]

      paymentId = String(approvedOrLatestPayment?.id || '')
    }

    if (!paymentId) {
      console.info('Mercado Pago webhook ignorado: sem payment id.', {
        eventType,
        resourceId,
      })

      return NextResponse.json({ received: true, ignored: true })
    }

    const { response: paymentResponse, data: payment } =
      await fetchMercadoPagoJson<MercadoPagoPayment>(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        accessToken
      )

    if (!paymentResponse.ok || !payment?.id) {
      console.error('Mercado Pago pagamento nao confirmado ao buscar detalhes.', {
        paymentId,
        status: paymentResponse.status,
        message: payment?.message,
      })

      return NextResponse.json(
        { error: payment?.message || 'Pagamento Mercado Pago nao confirmado.' },
        { status: 502 }
      )
    }

    if (!merchantOrder && !payment.external_reference && payment.order?.id) {
      const merchantOrderResult = await fetchMercadoPagoJson<MercadoPagoMerchantOrder>(
        `https://api.mercadopago.com/merchant_orders/${payment.order.id}`,
        accessToken
      )

      if (merchantOrderResult.response.ok && merchantOrderResult.data) {
        merchantOrder = merchantOrderResult.data
      }
    }

    const externalReference = payment.external_reference || merchantOrder?.external_reference || null
    const orderId = getSafeOrderId(payment.metadata?.order_id)
    const providerPreferenceId =
      merchantOrder?.preference_id ||
      null

    console.info('Mercado Pago pagamento recebido', {
      paymentId: String(payment.id),
      status: payment.status || 'unknown',
      externalReference,
      orderId,
      providerPreferenceId,
      paymentMethod: payment.payment_method_id || null,
    })

    const supabase = getServiceSupabase()
    let { data, error } = await supabase.rpc('complete_mercadopago_payment_order_v2', {
      p_provider_payment_id: String(payment.id || paymentId),
      p_provider_status: payment.status || 'unknown',
      p_external_reference: externalReference,
      p_order_id: orderId,
      p_provider_preference_id: providerPreferenceId,
      p_provider_payment_method: payment.payment_method_id || null,
    })

    if (error && externalReference) {
      console.info('Tentando fallback da RPC antiga de Mercado Pago.', {
        paymentId: String(payment.id || paymentId),
        externalReference,
      })

      const fallbackResult = await supabase.rpc('complete_mercadopago_payment_order', {
        p_external_reference: externalReference,
        p_provider_payment_id: String(payment.id || paymentId),
        p_provider_status: payment.status || 'unknown',
      })

      data = fallbackResult.data
      error = fallbackResult.error
    }

    if (error) {
      console.error('Erro ao processar pagamento Mercado Pago aprovado/pending.', {
        paymentId: String(payment.id || paymentId),
        status: payment.status || 'unknown',
        externalReference,
        orderId,
        providerPreferenceId,
        error: error.message,
      })

      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.info('Mercado Pago pagamento processado', {
      paymentId: String(payment.id || paymentId),
      status: payment.status || 'unknown',
      result: data,
    })

    return NextResponse.json({ received: true, result: data })
  } catch (error) {
    console.error('Erro no webhook Mercado Pago:', error)

    return NextResponse.json(
      { error: 'Erro interno no webhook.' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
