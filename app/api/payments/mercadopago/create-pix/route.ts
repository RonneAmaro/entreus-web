import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePaymentTotals, getPaymentMethodConfig, PLATFORM_FEE_PERCENT } from '@/lib/payment-fees'

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
const PIX_ORDER_CREATION_ERROR =
  'Nao foi possivel preparar o pedido Pix agora. Tente novamente em instantes.'
const PIX_PROVIDER_ERROR =
  'Nao foi possivel gerar o Pix automatico agora. Tente novamente em instantes.'
const PIX_PERSISTENCE_ERROR =
  'O Pix foi gerado, mas nao foi possivel concluir o registro interno do pagamento.'
const INVALID_NOTIFICATION_URL_ERROR =
  'Configure uma URL pública HTTPS para receber notificações do Mercado Pago.'

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

function buildNotificationUrl() {
  const explicitNotificationUrl = process.env.MERCADO_PAGO_NOTIFICATION_URL?.trim()

  if (explicitNotificationUrl) {
    return {
      value: explicitNotificationUrl,
      source: 'MERCADO_PAGO_NOTIFICATION_URL',
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (!siteUrl) {
    return {
      value: '',
      source: 'NEXT_PUBLIC_SITE_URL',
    }
  }

  return {
    value: `${siteUrl.replace(/\/$/, '')}/api/payments/mercadopago/webhook`,
    source: 'NEXT_PUBLIC_SITE_URL',
  }
}

function isValidMercadoPagoNotificationUrl(value: string) {
  if (!value) return false

  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()

    return (
      url.protocol === 'https:' &&
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      !hostname.endsWith('.localhost')
    )
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN

    if (!accessToken) {
      console.error('Mercado Pago Pix configuracao ausente: MERCADO_PAGO_ACCESS_TOKEN.')
      return NextResponse.json(
        { error: MERCADO_PAGO_CONFIGURATION_ERROR },
        { status: 503 }
      )
    }

    const notificationUrl = buildNotificationUrl()

    if (!isValidMercadoPagoNotificationUrl(notificationUrl.value)) {
      let safeHostname = ''

      try {
        safeHostname = new URL(notificationUrl.value).hostname
      } catch {
        safeHostname = 'invalid-url'
      }

      console.error('Mercado Pago Pix notification_url debug', {
        source: notificationUrl.source,
        value: notificationUrl.value,
        startsWithHttps: notificationUrl.value.startsWith('https://'),
        hostname: safeHostname,
      })

      console.error(
        `Mercado Pago Pix notification_url invalida. Configure ${notificationUrl.source} com uma URL publica HTTPS.`
      )

      return NextResponse.json(
        { error: INVALID_NOTIFICATION_URL_ERROR },
        { status: 503 }
      )
    }

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
      return NextResponse.json({ error: 'Entre na sua conta para pagar.' }, { status: 401 })
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
      console.error('Mercado Pago Pix nao conseguiu criar o pedido interno.', {
        code: orderError?.code || null,
      })
      return NextResponse.json(
        { error: PIX_ORDER_CREATION_ERROR },
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
        notification_url: notificationUrl.value,
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
      console.error('Mercado Pago Pix nao retornou um QR Code valido.', {
        status: paymentResponse.status,
        providerStatus: payment?.status || null,
      })
      return NextResponse.json(
        { error: PIX_PROVIDER_ERROR },
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
      console.error('Mercado Pago Pix nao conseguiu registrar o pagamento gerado.', {
        code: attachError.code || null,
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
    console.error('Erro ao criar Pix Mercado Pago:', error)

    return NextResponse.json(
      { error: 'Erro interno ao criar Pix Mercado Pago.' },
      { status: 500 }
    )
  }
}
