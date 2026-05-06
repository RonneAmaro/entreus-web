import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type MetaWhatsAppSuccess = {
  messaging_product?: string
  contacts?: Array<{
    input?: string
    wa_id?: string
  }>
  messages?: Array<{
    id?: string
    message_status?: string
  }>
}

type MetaWhatsAppError = {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function maskPhone(value: string) {
  const digits = onlyDigits(value)

  if (digits.length <= 4) {
    return '****'
  }

  const start = digits.slice(0, 4)
  const end = digits.slice(-4)

  return `${start}******${end}`
}

function getMissingEnvVars() {
  const required = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_API_VERSION',
    'WHATSAPP_TEST_TO',
    'WHATSAPP_TEST_SECRET',
  ]

  return required.filter((key) => !process.env[key])
}

async function readJsonBody(request: Request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: 'METHOD_NOT_ALLOWED',
      message:
        'Use POST nesta rota, enviando o segredo no header x-test-secret.',
      example:
        'curl -X POST https://entreus.vercel.app/api/whatsapp/test-send -H "Content-Type: application/json" -H "x-test-secret: SEU_SEGREDO" -d \'{"message":"Teste direto do EntreUS Lab"}\'',
    },
    {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    },
  )
}

export async function POST(request: Request) {
  const missing = getMissingEnvVars()

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'MISSING_ENV_VARS',
        message:
          'Existem variáveis de ambiente ausentes na Vercel. Adicione as variáveis e faça redeploy.',
        missing,
      },
      { status: 500 },
    )
  }

  const expectedSecret = process.env.WHATSAPP_TEST_SECRET as string
  const receivedSecret =
    request.headers.get('x-test-secret') ||
    new URL(request.url).searchParams.get('secret') ||
    ''

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Segredo de teste inválido ou ausente.',
      },
      { status: 401 },
    )
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN as string
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID as string
  const apiVersion = process.env.WHATSAPP_API_VERSION as string
  const testTo = onlyDigits(process.env.WHATSAPP_TEST_TO as string)

  if (!/^\d{10,15}$/.test(testTo)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'INVALID_TEST_PHONE',
        message:
          'WHATSAPP_TEST_TO precisa estar no formato internacional, somente números. Exemplo: 5569984739092.',
        currentValueMasked: maskPhone(testTo),
      },
      { status: 500 },
    )
  }

  const body = await readJsonBody(request)

  const customMessage =
    typeof body?.message === 'string' && body.message.trim().length > 0
      ? body.message.trim().slice(0, 1000)
      : ''

  const message =
    customMessage ||
    `Teste direto do EntreUS Lab ✅

Se você recebeu esta mensagem, a Vercel conseguiu enviar pelo WhatsApp Cloud API.

Agora o próximo diagnóstico é confirmar se o webhook real da Meta está entregando as mensagens recebidas.`

  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const metaResponse = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: testTo,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      }),
    })

    const responseText = await metaResponse.text()

    let parsedResponse: MetaWhatsAppSuccess | MetaWhatsAppError | null = null

    try {
      parsedResponse = JSON.parse(responseText)
    } catch {
      parsedResponse = null
    }

    if (!metaResponse.ok) {
      const metaError = (parsedResponse as MetaWhatsAppError | null)?.error

      return NextResponse.json(
        {
          ok: false,
          sent: false,
          error: 'META_SEND_FAILED',
          message: 'A Meta recusou o envio da mensagem.',
          status: metaResponse.status,
          toMasked: maskPhone(testTo),
          metaError: metaError
            ? {
                message: metaError.message,
                type: metaError.type,
                code: metaError.code,
                error_subcode: metaError.error_subcode,
                fbtrace_id: metaError.fbtrace_id,
              }
            : null,
          rawResponsePreview: responseText.slice(0, 800),
        },
        { status: 502 },
      )
    }

    const success = parsedResponse as MetaWhatsAppSuccess | null

    return NextResponse.json({
      ok: true,
      sent: true,
      message: 'Mensagem de teste enviada para a API da Meta.',
      toMasked: maskPhone(testTo),
      meta: {
        messaging_product: success?.messaging_product || null,
        contactWaId: success?.contacts?.[0]?.wa_id || null,
        messageId: success?.messages?.[0]?.id || null,
        messageStatus: success?.messages?.[0]?.message_status || null,
      },
    })
  } catch (error) {
    const isAbortError =
      error instanceof Error && error.name === 'AbortError'

    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error: isAbortError ? 'META_TIMEOUT' : 'SERVER_ERROR',
        message: isAbortError
          ? 'A chamada para a Meta demorou demais e foi cancelada.'
          : 'Erro interno ao tentar enviar a mensagem de teste.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  } finally {
    clearTimeout(timeout)
  }
}