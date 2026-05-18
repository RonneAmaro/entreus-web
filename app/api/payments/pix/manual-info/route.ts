import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  try {
    const supabase = getSupabaseForRequest(request)
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: 'Entre na sua conta para ver as instrucoes Pix.' }, { status: 401 })
    }

    const pixKey = process.env.PIX_KEY || ''

    return NextResponse.json({
      pix_key: pixKey,
      pixPaymentLink: process.env.PIX_PAYMENT_LINK || '',
      receiver_name: process.env.PIX_RECEIVER_NAME || '',
      receiver_city: process.env.PIX_RECEIVER_CITY || '',
      configured: Boolean(pixKey),
    })
  } catch (error) {
    console.error('Erro ao carregar informacoes Pix:', error)

    return NextResponse.json(
      { error: 'Erro interno ao carregar Pix manual.' },
      { status: 500 }
    )
  }
}
