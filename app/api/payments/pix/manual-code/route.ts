import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { calculatePaymentTotals } from '@/lib/payment-fees'
import { getVipPurchasePlan } from '@/lib/vip-plans'
import { generatePixBrcode } from '@/lib/payments/pix-brcode'
import { resolvePixConfiguration } from '@/lib/payments/pix-config'
import { paymentError } from '@/lib/payments/errors'
import { getBearerAuthorization } from '@/lib/payments/server-auth'

const MAX_MANUAL_ITACASH = 1_000_000

function client(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('supabase_configuration_missing')
  const authorization = request.headers.get('authorization') || ''
  return createClient(url, key, { global: { headers: authorization ? { Authorization: authorization } : {} } })
}

export async function POST(request: Request) {
  try {
    if (!getBearerAuthorization(request)) return NextResponse.json(paymentError('authentication_required'), { status: 401 })
    const { data: { user }, error: userError } = await client(request).auth.getUser()
    if (userError || !user) return NextResponse.json(paymentError('authentication_rejected'), { status: 401 })
    const body = await request.json().catch(() => null)
    const productType = body?.product_type
    const vipPlan = productType === 'vip_plus' ? getVipPurchasePlan(String(body?.plan_key || '')) : null
    const amountItacash = productType === 'itacash' ? Number(body?.amount_itacash) : Number.NaN
    if ((!vipPlan && productType === 'vip_plus') || (productType === 'itacash' && (!Number.isSafeInteger(amountItacash) || amountItacash <= 0 || amountItacash > MAX_MANUAL_ITACASH)) || !['vip_plus', 'itacash'].includes(productType)) {
      return NextResponse.json({ error: 'Dados do pagamento inválidos.', code: 'invalid_payment_request' }, { status: 400 })
    }
    const configResult = resolvePixConfiguration()
    if (!configResult.ok) return NextResponse.json({ configured: false, ...paymentError(configResult.code) }, { status: 503 })
    const config = configResult.config
    const base = vipPlan ? vipPlan.amountBrlCents : amountItacash * 10
    const totals = calculatePaymentTotals(base, 'pix_manual')
    const reference = vipPlan ? vipPlan.planKey : `IC${amountItacash}`
    let payload: string
    let qrCodeDataUrl: string
    try {
      payload = generatePixBrcode({ ...config, amountBrlCents: totals.totalBrlCents, txid: reference })
      qrCodeDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 320 })
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_pix_amount') {
        return NextResponse.json(paymentError('pix_amount_invalid'), { status: 400 })
      }
      return NextResponse.json(paymentError('pix_generation_failed'), { status: 500 })
    }
    return NextResponse.json({
      configured: true, product_type: productType, plan_key: vipPlan?.planKey,
      amount_itacash: amountItacash || undefined, total_brl_cents: totals.totalBrlCents,
      pix_copy_paste: payload, qr_code_data_url: qrCodeDataUrl,
      receiver_name: config.receiverName, receiver_city: config.receiverCity, reference,
    })
  } catch {
    return NextResponse.json(paymentError('temporary_pix_error'), { status: 500 })
  }
}
