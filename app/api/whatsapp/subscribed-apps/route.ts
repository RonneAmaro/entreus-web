import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitExceededResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUBSCRIBED_APPS_GET_LIMITER = createRateLimiter({
  limit: 10,
  windowMs: 10 * 60 * 1000,
})

const SUBSCRIBED_APPS_POST_LIMITER = createRateLimiter({
  limit: 5,
  windowMs: 10 * 60 * 1000,
})

type MetaError = {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

function getMissingEnvVars() {
  const required = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_API_VERSION',
    'WHATSAPP_BUSINESS_ACCOUNT_ID',
    'WHATSAPP_TEST_SECRET',
  ]

  return required.filter((key) => !process.env[key])
}

function getRateLimitIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown'
}

function getBearerSecret(request: Request) {
  const authorization = request.headers.get('authorization')?.trim() || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function safeEqualSecret(received: string, expected: string) {
  if (!received || !expected) return false

  const receivedHash = createHash('sha256').update(received).digest()
  const expectedHash = createHash('sha256').update(expected).digest()

  return timingSafeEqual(receivedHash, expectedHash)
}

function getLimiter(method: 'GET' | 'POST') {
  return method === 'GET' ? SUBSCRIBED_APPS_GET_LIMITER : SUBSCRIBED_APPS_POST_LIMITER
}

async function callMetaSubscribedApps(method: 'GET' | 'POST') {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN as string
  const apiVersion = process.env.WHATSAPP_API_VERSION as string
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID as string

  const endpoint = `https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(endpoint, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const responseText = await response.text()

    let parsed: unknown = null

    try {
      parsed = JSON.parse(responseText)
    } catch {
      parsed = null
    }

    if (!response.ok) {
      const metaError = parsed as MetaError

      return {
        ok: false,
        status: response.status,
        metaError: metaError?.error
          ? {
              message: metaError.error.message,
              type: metaError.error.type,
              code: metaError.error.code,
              error_subcode: metaError.error.error_subcode,
              fbtrace_id: metaError.error.fbtrace_id,
            }
          : null,
        rawResponsePreview: responseText.slice(0, 800),
      }
    }

    return {
      ok: true,
      status: response.status,
      data: parsed,
    }
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === 'AbortError'

    return {
      ok: false,
      status: 500,
      metaError: null,
      rawResponsePreview: isAbortError
        ? 'Timeout ao chamar a Meta.'
        : error instanceof Error
          ? error.message
          : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function authorizeOperationalRequest(request: Request) {
  const method = request.method === 'POST' ? 'POST' : 'GET'
  const rateLimit = await getLimiter(method).check({
    key: `${getRateLimitIp(request)}:whatsapp-subscribed-apps:${method}`,
  })

  if (!rateLimit.ok) {
    return createRateLimitExceededResponse(rateLimit, {
      ok: false,
      error: 'RATE_LIMITED',
      message: 'Muitas requisições operacionais. Tente novamente mais tarde.',
    })
  }

  const missing = getMissingEnvVars()

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'MISSING_ENV_VARS',
        message: 'Configuração operacional indisponível.',
      },
      { status: 500 },
    )
  }

  const expectedSecret = process.env.WHATSAPP_TEST_SECRET as string
  const receivedSecret = getBearerSecret(request)

  if (!safeEqualSecret(receivedSecret, expectedSecret)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Segredo de teste inválido ou ausente.',
      },
      { status: 401 },
    )
  }

  return null
}

export async function GET(request: Request) {
  const deniedResponse = await authorizeOperationalRequest(request)
  if (deniedResponse) return deniedResponse

  const result = await callMetaSubscribedApps('GET')

  return NextResponse.json({
    ok: result.ok,
    action: 'check_subscribed_apps',
    message: result.ok
      ? 'Consulta feita com sucesso.'
      : 'A Meta recusou a consulta de apps inscritos.',
    result,
  })
}

export async function POST(request: Request) {
  const deniedResponse = await authorizeOperationalRequest(request)
  if (deniedResponse) return deniedResponse

  const result = await callMetaSubscribedApps('POST')

  return NextResponse.json({
    ok: result.ok,
    action: 'subscribe_app_to_waba',
    message: result.ok
      ? 'App inscrito/confirmado nos webhooks do WhatsApp Business Account.'
      : 'A Meta recusou a inscrição do app no WABA.',
    result,
  })
}
