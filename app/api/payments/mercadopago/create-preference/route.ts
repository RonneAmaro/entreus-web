import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePaymentTotals, getPaymentMethodConfig } from '@/lib/payment-fees'

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
const VIP_PLUS_PRICE_BRL_CENTS = 1490
const VIP_PLUS_BONUS_ITACASH = 100

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
  paymentMethodOption: string
) {
  const baseAmountBrlCents =
    productType === 'itacash' ? (amountItacash || 0) * 10 : VIP_PLUS_PRICE_BRL_CENTS
  return calculatePaymentTotals(baseAmountBrlCents, paymentMethodOption)
}

export async function POST(request: Request) {
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (!accessToken || !siteUrl) {
      return NextResponse.json(
        { error: 'Mercado Pago ainda nao esta configurado no servidor.' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => null)
    const productType = String(body?.product_type || '') as ProductType
    const amountItacash =
      productType === 'itacash' ? Number.parseInt(String(body?.amount_itacash || ''), 10) : null
    const paymentMethodOption = String(body?.payment_method_option || 'mercadopago_pix')
    const paymentMethod = getPaymentMethodConfig(paymentMethodOption)
    const autoRenewVipPlus = Boolean(body?.auto_renew)

    if (productType !== 'itacash' && productType !== 'vip_plus') {
      return NextResponse.json({ error: 'Produto invalido.' }, { status: 400 })
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

    const totals = calculateTotals(productType, amountItacash, paymentMethod.value)

    const { data: orderData, error: orderError } = await supabase.rpc('create_payment_order', {
      p_product_type: productType,
      p_product_id: productType === 'vip_plus' ? 'vip_plus_monthly' : null,
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
              vip_plus_bonus_itacash: VIP_PLUS_BONUS_ITACASH,
              payment_method_option: paymentMethod.value,
              auto_renew_requested: autoRenewVipPlus,
            }
          : { payment_method_option: paymentMethod.value },
    })

    if (orderError || !orderData) {
      return NextResponse.json(
        { error: orderError?.message || 'Nao foi possivel criar pedido de pagamento.' },
        { status: 400 }
      )
    }

    const order = orderData as PaymentOrder
    const title =
      productType === 'vip_plus'
        ? 'EntreUS VIP Plus'
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
                ? 'Plano VIP Plus mensal EntreUS'
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
          auto_renew_requested: productType === 'vip_plus' ? autoRenewVipPlus : undefined,
          user_id: user.id,
        },
      }),
      cache: 'no-store',
    })

    const preference = (await preferenceResponse.json().catch(() => null)) as MercadoPagoPreference | null

    if (!preferenceResponse.ok || !preference?.id) {
      return NextResponse.json(
        { error: preference?.message || 'Nao foi possivel criar preferencia Mercado Pago.' },
        { status: 502 }
      )
    }

    const initPoint = preference.init_point || preference.sandbox_init_point || ''

    const { error: attachError } = await supabase.rpc('attach_mercadopago_preference', {
      p_order_id: order.id,
      p_provider_preference_id: preference.id,
      p_provider_init_point: initPoint,
    })

    if (attachError) {
      return NextResponse.json(
        { error: 'Preferencia criada, mas nao foi possivel salvar o link: ' + attachError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      order_id: order.id,
      external_reference: order.external_reference,
      provider_preference_id: preference.id,
      provider_init_point: initPoint,
      payment_method_option: paymentMethod.value,
      totals,
    })
  } catch (error) {
    console.error('Erro ao criar preferencia Mercado Pago:', error)

    return NextResponse.json(
      { error: 'Erro interno ao criar pagamento.' },
      { status: 500 }
    )
  }
}
