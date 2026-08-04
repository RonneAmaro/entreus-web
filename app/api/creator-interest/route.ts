import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { validateCreatorInterest } from '@/lib/creator-interest'
import { createRateLimiter, createRateLimitExceededResponse } from '@/lib/rate-limit'

const CREATOR_INTEREST_IP_LIMITER = createRateLimiter({ limit: 10, windowMs: 30 * 60 * 1000 })
const CREATOR_INTEREST_EMAIL_LIMITER = createRateLimiter({ limit: 3, windowMs: 24 * 60 * 60 * 1000 })

function getRateLimitIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

function hashRateLimitValue(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function POST(request: Request) {
  const ipRateLimit = await CREATOR_INTEREST_IP_LIMITER.check({
    key: `${getRateLimitIp(request)}:creator-interest`,
  })

  if (!ipRateLimit.ok) {
    return createRateLimitExceededResponse(ipRateLimit, {
      error: 'RATE_LIMITED',
      message: 'Muitas solicitações enviadas recentemente. Tente novamente mais tarde.',
    })
  }

  try {
    const input = validateCreatorInterest(await request.json())
    if (!input.ok) return NextResponse.json({ message: input.error }, { status: 400 })

    const normalizedEmail = input.value.email.trim().toLowerCase()
    const emailRateLimit = await CREATOR_INTEREST_EMAIL_LIMITER.check({
      key: `${hashRateLimitValue(normalizedEmail)}:creator-interest-email`,
    })

    if (!emailRateLimit.ok) {
      return createRateLimitExceededResponse(emailRateLimit, {
        error: 'RATE_LIMITED',
        message: 'Muitas solicitações enviadas recentemente. Tente novamente mais tarde.',
      })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error()

    const db = createClient(url, key)
    const { error } = await db.from('creator_interest_requests').insert(input.value)
    if (error) throw error

    return NextResponse.json({
      message: 'Recebemos seu interesse. A equipe EntreUS poderá analisar e entrar em contato quando houver novas etapas.',
    })
  } catch {
    return NextResponse.json(
      { message: 'Não foi possível enviar agora. Tente novamente em instantes.' },
      { status: 500 },
    )
  }
}
