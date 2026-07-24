import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePaymentTotals, PLATFORM_FEE_PERCENT } from '@/lib/payment-fees'
import { getSafeCheckoutUrl } from '@/lib/vip-checkout-flow'
import { getVipPurchasePlan, VIP_PRICE_VERSION } from '@/lib/vip-plans'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'

type CreateVipOrderBody = {
  plan_key?: unknown
}

type PaymentOrder = {
  id: string
  external_reference: string
  product_id: string | null
  product_type: 'vip_plus'
  status: string
  base_amount_brl_cents: number
  platform_fee_brl_cents: number
  operator_fee_brl_cents: number
  total_brl_cents: number
  metadata: Record<string, unknown> | null
  provider_init_point?: string | null
  created_at?: string
}

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

export async function POST(request: Request) {
  const requestId = getRequestCorrelationId(request)

  try {
    const body = (await request.json().catch(() => ({}))) as CreateVipOrderBody
    const planKey = typeof body.plan_key === 'string' ? body.plan_key : ''
    const plan = getVipPurchasePlan(planKey)

    if (!plan) {
      return NextResponse.json({ ok: false, error: 'Plano VIP invalido.' }, { status: 400 })
    }

    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: 'Entre na sua conta para preparar a compra VIP.' }, { status: 401 })
    }

    const totals = calculatePaymentTotals(plan.amountBrlCents, 'mercadopago_pix')

    const { data: orderData, error: orderError } = await supabase.rpc('create_payment_order', {
      p_product_type: 'vip_plus',
      p_product_id: plan.planKey,
      p_amount_itacash: null,
      p_base_amount_brl_cents: totals.baseAmountBrlCents,
      p_platform_fee_percent: PLATFORM_FEE_PERCENT,
      p_platform_fee_brl_cents: totals.platformFeeBrlCents,
      p_operator_fee_percent: totals.operatorFeePercent,
      p_operator_fee_brl_cents: totals.operatorFeeBrlCents,
      p_total_brl_cents: totals.totalBrlCents,
      p_metadata: {
        purpose: 'vip_subscription',
        plan_key: plan.planKey,
        plan_label: plan.label,
        days: plan.days,
        price_version: VIP_PRICE_VERSION,
        payment_method_option: totals.method.value,
        activation_pending: true,
        activation_requires_webhook_future: true,
        note: 'Pedido VIP preparado sem iniciar pagamento real neste pacote.',
      },
    })

    if (orderError || !orderData) {
      logServerEvent('error', {
        event: 'vip_purchase_order.create_failed',
        requestId,
        context: { planKey: plan.planKey },
        error: orderError,
      })
      return NextResponse.json(
        { ok: false, error: 'NÃ£o foi possÃ­vel preparar a compra VIP agora. Tente novamente em instantes.' },
        { status: 400 },
      )
    }

    const order = orderData as PaymentOrder

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        externalReference: order.external_reference,
        productId: order.product_id,
        status: order.status,
        planKey: plan.planKey,
        planLabel: plan.label,
        days: plan.days,
        totals,
      },
    })
  } catch (error) {
    logServerEvent('error', {
      event: 'vip_purchase_order.unexpected_post_error',
      requestId,
      error,
    })
    return NextResponse.json({ ok: false, error: 'Erro interno ao preparar pedido VIP.' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const requestId = getRequestCorrelationId(request)

  try {
    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: 'Entre na sua conta para continuar o pagamento VIP.' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('payment_orders')
      .select('id, external_reference, product_id, status, total_brl_cents, provider_init_point, metadata, created_at')
      .eq('product_type', 'vip_plus')
      .eq('status', 'pending')
      .not('provider_init_point', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logServerEvent('warn', {
        event: 'vip_purchase_order.pending_lookup_failed',
        requestId,
        error,
      })
      return NextResponse.json({ ok: false, error: 'NÃ£o foi possÃ­vel consultar pagamentos pendentes agora.' }, { status: 500 })
    }

    const order = data as PaymentOrder | null
    const checkoutUrl = getSafeCheckoutUrl(order?.provider_init_point)
    const plan = getVipPurchasePlan(order?.product_id)

    return NextResponse.json({
      ok: true,
      order:
        order && checkoutUrl && plan
          ? {
              id: order.id,
              externalReference: order.external_reference,
              status: order.status,
              planKey: plan.planKey,
              planLabel: plan.label,
              days: plan.days,
              checkoutUrl,
            }
          : null,
    })
  } catch (error) {
    logServerEvent('error', {
      event: 'vip_purchase_order.unexpected_get_error',
      requestId,
      error,
    })
    return NextResponse.json({ ok: false, error: 'NÃ£o foi possÃ­vel consultar pagamentos pendentes agora.' }, { status: 500 })
  }
}
