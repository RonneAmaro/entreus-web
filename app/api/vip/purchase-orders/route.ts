import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculatePaymentTotals, PLATFORM_FEE_PERCENT } from '@/lib/payment-fees'
import { getVipPurchasePlan, VIP_PRICE_VERSION } from '@/lib/vip-plans'

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
      return NextResponse.json(
        { ok: false, error: orderError?.message || 'Nao foi possivel criar o pedido VIP.' },
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
    console.error('Erro ao preparar pedido VIP:', error)
    return NextResponse.json({ ok: false, error: 'Erro interno ao preparar pedido VIP.' }, { status: 500 })
  }
}
