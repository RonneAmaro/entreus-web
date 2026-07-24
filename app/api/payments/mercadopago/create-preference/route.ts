import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePaymentTotals, getPaymentMethodConfig } from '@/lib/payment-fees'
import { getSafeCheckoutUrl } from '@/lib/vip-checkout-flow'
import { getVipPurchasePlan, VIP_PRICE_VERSION } from '@/lib/vip-plans'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'

type ProductType = 'itacash' | 'vip_plus'

type PaymentOrder = {
  id: string
  external_reference: string
  product_type: ProductType
  amount_itacash: number | null
  total_brl_cents: number
}

type MercadoPagoPreference = {
  id?: string
  init_point?: string
  sandbox_init_point?: string
  message?: string
}

const PLATFORM_FEE_PERCENT = 2
const MERCADO_PAGO_CONFIGURATION_ERROR =
  'Os pagamentos automaticos do Mercado Pago ainda nao estao configurados neste ambiente.'
const PAYMENT_ORDER_CREATION_ERROR =
  'Nao foi possivel preparar o pedido de pagamento agora. Tente novamente em instantes.'

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

function calculateTotals(
  productType: ProductType,
  amountItacash: number | null,
  paymentMethodOption: string,
  vipAmountBrlCents: number | null = null,
) {
  const baseAmountBrlCents =
    productType === 'itacash' ? (amountItacash || 0) * 10 : vipAmountBrlCents || 0
  return calculatePaymentTotals(baseAmountBrlCents, paymentMethodOption)
}

export async function POST(request: Request) {
  const requestId = getRequestCorrelationId(request)
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (!accessToken || !siteUrl) {
      return NextResponse.json(
        { error: MERCADO_PAGO_CONFIGURATION_ERROR },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => null)
    const productType = String(body?.product_type || '') as ProductType
    const amountItacash =
      productType === 'itacash' ? Number.parseInt(String(body?.amount_itacash || ''), 10) : null
    const paymentMethodOption = String(body?.payment_method_option || 'mercadopago_pix')
    const paymentMethod = getPaymentMethodConfig(paymentMethodOption)
    const vipPlan = productType === 'vip_plus'
      ? getVipPurchasePlan(String(body?.plan_key || 'vip_30d'))
      : null

    if (productType !== 'itacash' && productType !== 'vip_plus') {
      return NextResponse.json({ error: 'Produto invalido.' }, { status: 400 })
    }

    if (productType === 'vip_plus' && !vipPlan) {
      return NextResponse.json({ error: 'Plano VIP invalido.' }, { status: 400 })
    }

    if (productType === 'itacash' && (!amountItacash || amountItacash <= 0)) {
      return NextResponse.json({ error: 'Quantidade de ItaCash invalida.' }, { status: 400 })
    }

    if (
      !paymentMethod.available ||
      paymentMethod.value === 'pix_manual' ||
      paymentMethod.value === 'open_finance' ||
      paymentMethod.value === 'boleto'
    ) {
      return NextResponse.json(
        { error: 'Metodo de pagamento automatico indisponivel.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Entre na sua conta para pagar.' }, { status: 401 })
    }

    const totals = calculateTotals(productType, amountItacash, paymentMethod.value, vipPlan?.amountBrlCents || null)

    const { data: orderData, error: orderError } = await supabase.rpc('create_payment_order', {
      p_product_type: productType,
      p_product_id: productType === 'vip_plus' ? vipPlan!.planKey : null,
      p_amount_itacash: amountItacash,
      p_base_amount_brl_cents: totals.baseAmountBrlCents,
      p_platform_fee_percent: PLATFORM_FEE_PERCENT,
      p_platform_fee_brl_cents: totals.platformFeeBrlCents,
      p_operator_fee_percent: totals.operatorFeePercent,
      p_operator_fee_brl_cents: totals.operatorFeeBrlCents,
      p_total_brl_cents: totals.totalBrlCents,
      p_metadata:
        productType === 'vip_plus'
          ? {
              purpose: 'vip_subscription',
              plan_key: vipPlan!.planKey,
              plan_label: vipPlan!.label,
              days: vipPlan!.days,
              price_version: VIP_PRICE_VERSION,
              payment_method_option: paymentMethod.value,
              activation_pending: true,
            }
          : { payment_method_option: paymentMethod.value },
    })

    if (orderError || !orderData) {
      logServerEvent('error', {
        event: 'mercadopago_preference.order_creation_failed',
        requestId,
        context: { productType, paymentMethod: paymentMethod.value, planKey: vipPlan?.planKey || null },
        error: orderError,
      })
      return NextResponse.json(
        { error: PAYMENT_ORDER_CREATION_ERROR },
        { status: 400 }
      )
    }

    const order = orderData as PaymentOrder
    const title =
      productType === 'vip_plus'
        ? `EntreUS ${vipPlan!.label}`
        : `${amountItacash} ItaCash EntreUS`

    const preferenceResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        external_reference: order.external_reference,
        notification_url: `${siteUrl.replace(/\/$/, '')}/api/payments/mercadopago/webhook`,
        // Checkout Pro decide se debito aparece conforme conta/cartao do pagador.
        // Mantemos debit_card sem exclusao para nao bloquear essa opcao quando disponivel.
        payment_methods: {
          excluded_payment_types: [],
          excluded_payment_methods: [],
        },
        back_urls: {
          success: `${siteUrl.replace(/\/$/, '')}/${productType === 'vip_plus' ? 'vip-plus' : 'wallet'}?payment=success`,
          pending: `${siteUrl.replace(/\/$/, '')}/${productType === 'vip_plus' ? 'vip-plus' : 'wallet'}?payment=pending`,
          failure: `${siteUrl.replace(/\/$/, '')}/${productType === 'vip_plus' ? 'vip-plus' : 'buy-itacash'}?payment=failure`,
        },
        auto_return: 'approved',
        items: [
          {
            id: productType,
            title,
            description:
              productType === 'vip_plus'
                ? `${vipPlan!.days} dias de VIP EntreUS`
                : 'Credito ItaCash para uso interno na EntreUS',
            quantity: 1,
            currency_id: 'BRL',
            unit_price: centsToBRL(order.total_brl_cents),
          },
        ],
        metadata: {
          order_id: order.id,
          product_type: productType,
          payment_method_option: paymentMethod.value,
          plan_key: productType === 'vip_plus' ? vipPlan!.planKey : undefined,
          days: productType === 'vip_plus' ? vipPlan!.days : undefined,
          user_id: user.id,
        },
      }),
      cache: 'no-store',
    })

    const preference = (await preferenceResponse.json().catch(() => null)) as MercadoPagoPreference | null

    if (!preferenceResponse.ok || !preference?.id) {
      logServerEvent('error', {
        event: 'mercadopago_preference.provider_rejected',
        requestId,
        context: { status: preferenceResponse.status, productType, orderId: order.id },
      })

      return NextResponse.json(
        { error: 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.' },
        { status: 502 }
      )
    }

    const initPoint = getSafeCheckoutUrl(preference.init_point || preference.sandbox_init_point)

    if (!initPoint) {
      logServerEvent('error', {
        event: 'mercadopago_preference.invalid_checkout_url',
        requestId,
        context: { preferenceId: preference.id, orderId: order.id, productType },
      })

      return NextResponse.json(
        { error: 'Não foi possível abrir o pagamento agora. Tente novamente em instantes.' },
        { status: 502 },
      )
    }

    const { error: attachError } = await supabase.rpc('attach_mercadopago_preference', {
      p_order_id: order.id,
      p_provider_preference_id: preference.id,
      p_provider_init_point: initPoint,
    })

    if (attachError) {
      logServerEvent('error', {
        event: 'mercadopago_preference.attach_failed',
        requestId,
        context: { orderId: order.id, preferenceId: preference.id, productType },
        error: attachError,
      })

      return NextResponse.json(
        { error: 'Não foi possível preparar o pagamento agora. Tente novamente em instantes.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      order_id: order.id,
      external_reference: order.external_reference,
      provider_preference_id: preference.id,
      provider_init_point: initPoint,
      checkout_url: initPoint,
      payment_method_option: paymentMethod.value,
      totals,
    })
  } catch (error) {
    logServerEvent('error', {
      event: 'mercadopago_preference.unexpected_error',
      requestId,
      error,
    })

    return NextResponse.json(
      { error: 'Erro interno ao criar pagamento.' },
      { status: 500 }
    )
  }
}
