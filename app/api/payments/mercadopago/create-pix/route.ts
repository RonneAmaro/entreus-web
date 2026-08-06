import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePaymentTotals, getPaymentMethodConfig, PLATFORM_FEE_PERCENT } from '@/lib/payment-fees'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'
import { resolveMercadoPagoNotificationUrl } from '@/lib/payments/public-urls'
import { paymentError } from '@/lib/payments/errors'
import { getBearerAuthorization } from '@/lib/payments/server-auth'

type PaymentOrder = {
  id: string
  external_reference: string
  product_type: 'itacash'
  amount_itacash: number
  total_brl_cents: number
}

type MercadoPagoPixPayment = {
  id?: number | string
  status?: string
  status_detail?: string
  external_reference?: string
  date_of_expiration?: string
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string
      qr_code_base64?: string
      ticket_url?: string
    }
  }
  message?: string
}

const PIX_EXPIRATION_MINUTES = 30
const MERCADO_PAGO_CONFIGURATION_ERROR =
  'Os pagamentos automaticos do Mercado Pago ainda nao estao configurados neste ambiente.'
const PIX_PERSISTENCE_ERROR =
  'O Pix foi gerado, mas nao foi possivel concluir o registro interno do pagamento.'

function getSupabaseForRequest(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authorization = request.headers.get('authorization') || ''

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase public environment variables are missing.')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}

function centsToBRL(value: number) {
  return Number((value / 100).toFixed(2))
}

export async function POST(request: Request) {
  const requestId = getRequestCorrelationId(request)
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN

    if (!accessToken) {
      logServerEvent('error', {
        event: 'mercadopago_pix.config_missing',
        requestId,
      })
      return NextResponse.json(
        { error: MERCADO_PAGO_CONFIGURATION_ERROR },
        { status: 503 }
      )
    }

    const notificationUrl = resolveMercadoPagoNotificationUrl()

    if (!notificationUrl) {
      logServerEvent('error', {
        event: 'mercadopago_pix.invalid_notification_url',
        requestId,
        context: {
          source: 'payment-url-resolver',
          startsWithHttps: false,
          hostname: 'not-configured',
        },
      })

      return NextResponse.json(
        paymentError('payment_urls_not_configured'),
        { status: 503 }
      )
    }

    if (!getBearerAuthorization(request)) return NextResponse.json(paymentError('authentication_required'), { status: 401 })

    const body = await request.json().catch(() => null)
    const amountItacash = Number.parseInt(String(body?.amount_itacash || ''), 10)
    const paymentMethod = getPaymentMethodConfig('mercadopago_pix')

    if (!paymentMethod.available) {
      return NextResponse.json({ error: 'Mercado Pago Pix indisponivel.' }, { status: 400 })
    }

    if (!amountItacash || amountItacash <= 0) {
      return NextResponse.json({ error: 'Quantidade de ItaCash invalida.' }, { status: 400 })
    }

    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user?.email) {
      return NextResponse.json(paymentError('authentication_rejected'), { status: 401 })
    }

    const totals = calculatePaymentTotals(amountItacash * 10, paymentMethod.value)

    const { data: orderData, error: orderError } = await supabase.rpc('create_payment_order', {
      p_product_type: 'itacash',
      p_product_id: null,
      p_amount_itacash: amountItacash,
      p_base_amount_brl_cents: totals.baseAmountBrlCents,
      p_platform_fee_percent: PLATFORM_FEE_PERCENT,
      p_platform_fee_brl_cents: totals.platformFeeBrlCents,
      p_operator_fee_percent: totals.operatorFeePercent,
      p_operator_fee_brl_cents: totals.operatorFeeBrlCents,
      p_total_brl_cents: totals.totalBrlCents,
      p_metadata: {
        payment_method_option: paymentMethod.value,
        provider_payment_method: 'pix',
      },
    })

    if (orderError || !orderData) {
      logServerEvent('error', {
        event: 'mercadopago_pix.order_creation_failed',
        requestId,
        context: { amountItacash, paymentMethod: paymentMethod.value },
        error: orderError,
      })
      return NextResponse.json(
        paymentError('payment_order_creation_failed'),
        { status: 400 }
      )
    }

    const order = orderData as PaymentOrder
    const expirationDate = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60 * 1000)

    const paymentResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Idempotency-Key': order.id,
      },
      body: JSON.stringify({
        transaction_amount: centsToBRL(order.total_brl_cents),
        description: `${amountItacash} ItaCash EntreUS`,
        payment_method_id: 'pix',
        external_reference: order.external_reference,
        notification_url: notificationUrl,
        date_of_expiration: expirationDate.toISOString(),
        payer: {
          email: user.email,
        },
        metadata: {
          order_id: order.id,
          product_type: 'itacash',
          payment_method_option: paymentMethod.value,
          user_id: user.id,
        },
      }),
      cache: 'no-store',
    })

    const payment = (await paymentResponse.json().catch(() => null)) as MercadoPagoPixPayment | null
    const transactionData = payment?.point_of_interaction?.transaction_data

    if (!paymentResponse.ok || !payment?.id || (!transactionData?.qr_code && !transactionData?.qr_code_base64)) {
      logServerEvent('error', {
        event: 'mercadopago_pix.provider_qr_failed',
        requestId,
        context: {
          status: paymentResponse.status,
          providerStatus: payment?.status || null,
          orderId: order.id,
        },
      })
      return NextResponse.json(
        paymentError('payment_provider_rejected'),
        { status: 502 }
      )
    }

    const { error: attachError } = await supabase.rpc('attach_mercadopago_pix_payment', {
      p_order_id: order.id,
      p_provider_payment_id: String(payment.id),
      p_provider_status: payment.status || 'pending',
      p_pix_qr_code: transactionData.qr_code || null,
      p_pix_qr_code_base64: transactionData.qr_code_base64 || null,
      p_pix_ticket_url: transactionData.ticket_url || null,
      p_expires_at: payment.date_of_expiration || expirationDate.toISOString(),
    })

    if (attachError) {
      logServerEvent('error', {
        event: 'mercadopago_pix.attach_failed',
        requestId,
        context: {
          orderId: order.id,
          providerPaymentId: String(payment.id),
        },
        error: attachError,
      })
      return NextResponse.json(
        { error: PIX_PERSISTENCE_ERROR },
        { status: 500 }
      )
    }

    return NextResponse.json({
      order_id: order.id,
      external_reference: order.external_reference,
      provider_payment_id: String(payment.id),
      status: payment.status || 'pending',
      status_detail: payment.status_detail || null,
      qr_code: transactionData.qr_code || null,
      qr_code_base64: transactionData.qr_code_base64 || null,
      ticket_url: transactionData.ticket_url || null,
      expires_at: payment.date_of_expiration || expirationDate.toISOString(),
      payment_method_option: paymentMethod.value,
      totals,
    })
  } catch (error) {
    logServerEvent('error', {
      event: 'mercadopago_pix.unexpected_error',
      requestId,
      error,
    })

    return NextResponse.json(
      { error: 'Erro interno ao criar Pix Mercado Pago.' },
      { status: 500 }
    )
  }
}
