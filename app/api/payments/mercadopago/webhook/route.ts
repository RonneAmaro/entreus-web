import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type MercadoPagoPayment = {
  id?: number | string
  status?: string
  external_reference?: string
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

function getPaymentId(request: Request, body: unknown) {
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

export async function POST(request: Request) {
  try {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN

    if (!accessToken) {
      return NextResponse.json({ error: 'Mercado Pago nao configurado.' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const paymentId = getPaymentId(request, body)

    if (!paymentId) {
      return NextResponse.json({ received: true, ignored: true })
    }

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    const payment = (await paymentResponse.json().catch(() => null)) as MercadoPagoPayment | null

    if (!paymentResponse.ok || !payment?.external_reference) {
      return NextResponse.json(
        { error: payment?.message || 'Pagamento Mercado Pago nao confirmado.' },
        { status: 502 }
      )
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase.rpc('complete_mercadopago_payment_order', {
      p_external_reference: payment.external_reference,
      p_provider_payment_id: String(payment.id || paymentId),
      p_provider_status: payment.status || 'unknown',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

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
