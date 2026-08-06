import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestCorrelationId, logServerEvent } from '@/lib/logging/safe-logger'
import { inspectPixConfiguration } from '@/lib/payments/pix-config'
import { paymentError } from '@/lib/payments/errors'
import { getBearerAuthorization } from '@/lib/payments/server-auth'

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

export async function GET(request: Request) {
  const requestId = getRequestCorrelationId(request)
  try {
    if (!getBearerAuthorization(request)) return NextResponse.json(paymentError('authentication_required'), { status: 401 })
    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json(paymentError('authentication_rejected'), { status: 401 })
    }

    const diagnostic = inspectPixConfiguration()

    return NextResponse.json({
      configured: diagnostic.valid,
      diagnostic: {
        key_present: diagnostic.keyPresent,
        key_type: diagnostic.keyType,
        receiver_name_present: diagnostic.receiverNamePresent,
        receiver_city_present: diagnostic.receiverCityPresent,
        valid: diagnostic.valid,
        code: diagnostic.code,
      },
    })
  } catch (error) {
    logServerEvent('error', {
      event: 'pix_manual_info.load_failed',
      requestId,
      error,
    })

    return NextResponse.json(
      paymentError('temporary_pix_error'),
      { status: 500 }
    )
  }
}
