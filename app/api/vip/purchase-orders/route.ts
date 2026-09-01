import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePaymentTotals, PLATFORM_FEE_PERCENT } from '@/lib/payment-fees'
import { getSafeCheckoutUrl } from '@/lib/vip-checkout-flow'
import { getVipPurchasePlan, VIP_PRICE_VERSION } from '@/lib/vip-plans'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'
import {
  createTrustedPaymentOrder,
  type TrustedPaymentOrder,
} from '@/lib/payments/payment-orders-server'

type CreateVipOrderBody = {
  plan_key?: unknown
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

    const { data: orderData, error: orderError } = await createTrustedPaymentOrder({
      userId: user.id,
      productType: 'vip_plus',
      productId: plan.planKey,
      amountItacash: null,
      baseAmountBrlCents: totals.baseAmountBrlCents,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      platformFeeBrlCents: totals.platformFeeBrlCents,
      operatorFeePercent: totals.operatorFeePercent,
      operatorFeeBrlCents: totals.operatorFeeBrlCents,
      totalBrlCents: totals.totalBrlCents,
      metadata: {
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

    const order = orderData as TrustedPaymentOrder

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

    const order = data as TrustedPaymentOrder | null
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
