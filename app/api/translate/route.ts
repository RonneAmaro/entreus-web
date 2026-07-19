import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { parseBearerAuthorization, PRIVATE_NO_STORE_HEADERS } from '@/lib/creator-profile-route-security'
import { detectContentLocale } from '@/lib/i18n/content-language'
import { isLocale, type Locale } from '@/lib/i18n'

type MyMemoryResponse = {
  responseData?: { translatedText?: string }
  responseStatus?: number
  responseDetails?: string
  matches?: Array<{ translation?: string }>
}
type RateEntry = { count: number; resetAt: number }
const rateLimits = new Map<string, RateEntry>()
const WINDOW_MS = 60_000
const MAX_TRANSLATIONS = 12

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...PRIVATE_NO_STORE_HEADERS, ...(init?.headers ?? {}) },
  })
}

function isRateLimited(userId: string) {
  const now = Date.now()
  const entry = rateLimits.get(userId)
  if (!entry || entry.resetAt <= now) {
    rateLimits.set(userId, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_TRANSLATIONS
}

function providerCode(locale: Locale) {
  return locale === 'pt-BR' ? 'pt' : locale
}

export async function POST(request: Request) {
  const authorization = parseBearerAuthorization(request.headers.get('authorization'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!authorization.ok) return jsonNoStore({ error: 'Autenticacao obrigatoria.' }, { status: 401 })
  if (!url || !key) return jsonNoStore({ error: 'Configuracao indisponivel.' }, { status: 500 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const contentType = body?.contentType
  const contentId = typeof body?.contentId === 'string' ? body.contentId : ''
  const targetLanguage = body?.targetLanguage
  if ((contentType !== 'post' && contentType !== 'comment') || !contentId || !isLocale(targetLanguage)) {
    return jsonNoStore({ error: 'Solicitacao de traducao invalida.' }, { status: 400 })
  }

  const client = createClient(url, key, {
    global: { headers: { Authorization: authorization.authorization } },
  })
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()
  if (authError || !user) return jsonNoStore({ error: 'Autenticacao obrigatoria.' }, { status: 401 })
  if (isRateLimited(user.id)) return jsonNoStore({ error: 'Muitas traducoes. Aguarde um minuto.' }, { status: 429 })

  const table = contentType === 'post' ? 'posts' : 'comments'
  const { data: resource, error: resourceError } = await client
    .from(table)
    .select('content')
    .eq('id', contentId)
    .maybeSingle()
  const text = typeof resource?.content === 'string' ? resource.content.trim() : ''
  if (resourceError || !text) return jsonNoStore({ error: 'Conteudo indisponivel.' }, { status: 404 })
  if (text.length > 4500) return jsonNoStore({ error: 'Conteudo muito grande para traducao.' }, { status: 413 })

  const detected = detectContentLocale(text)
  if (detected === targetLanguage) {
    return jsonNoStore({ error: 'O conteudo ja esta neste idioma.' }, { status: 400 })
  }
  const source = providerCode(detected ?? (targetLanguage === 'pt-BR' ? 'en' : 'pt-BR'))
  const target = providerCode(targetLanguage)
  const providerUrl = new URL('https://api.mymemory.translated.net/get')
  providerUrl.searchParams.set('q', text)
  providerUrl.searchParams.set('langpair', `${source}|${target}`)
  const contactEmail = process.env.TRANSLATE_CONTACT_EMAIL
  if (contactEmail) providerUrl.searchParams.set('de', contactEmail)

  try {
    const response = await fetch(providerUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    const data = await response.json().catch(() => null) as MyMemoryResponse | null
    if (!response.ok || (data?.responseStatus && data.responseStatus >= 400)) {
      return jsonNoStore({ error: data?.responseDetails || 'Servico de traducao indisponivel.' }, { status: 502 })
    }
    const translatedText =
      data?.responseData?.translatedText ??
      data?.matches?.find((match) => match.translation)?.translation
    if (!translatedText) return jsonNoStore({ error: 'Servico de traducao indisponivel.' }, { status: 502 })
    return jsonNoStore({ translatedText, targetLanguage, sourceLanguage: detected })
  } catch {
    return jsonNoStore({ error: 'Servico de traducao indisponivel.' }, { status: 504 })
  }
}
