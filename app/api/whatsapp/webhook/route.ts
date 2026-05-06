import { NextRequest, NextResponse } from 'next/server'
import {
  buildIntroMessage,
  buildMediaReceivedMessage,
  extractWhatsAppMessages,
  sendWhatsAppTextMessage,
  verifyMetaSignature,
} from '@/lib/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

  if (!verifyToken) {
    return new NextResponse('WHATSAPP_VERIFY_TOKEN não configurado.', {
      status: 500,
    })
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  }

  return new NextResponse('Token de verificação inválido.', {
    status: 403,
  })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const signature =
    request.headers.get('x-hub-signature-256') ||
    request.headers.get('x-hub-signature')

  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Assinatura inválida.',
      },
      {
        status: 401,
      }
    )
  }

  let payload: unknown

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'JSON inválido.',
      },
      {
        status: 400,
      }
    )
  }

  const messages = extractWhatsAppMessages(payload)

  if (messages.length === 0) {
    return NextResponse.json({
      ok: true,
      received: true,
      messages: 0,
      note: 'Webhook recebido sem mensagem de usuário. Pode ser status/evento.',
    })
  }

  for (const message of messages) {
    try {
      if (message.type === 'text') {
        const text = message.text?.trim().toLowerCase() || ''

        if (
          text.includes('poster') ||
          text.includes('pôster') ||
          text.includes('pdf') ||
          text.includes('ajuda') ||
          text.includes('iniciar') ||
          text.includes('oi') ||
          text.includes('olá')
        ) {
          await sendWhatsAppTextMessage(
            message.from,
            buildIntroMessage(message.profileName)
          )
        } else {
          await sendWhatsAppTextMessage(
            message.from,
            [
              '💙 EntreUS Lab recebido!',
              '',
              'Para começar, envie:',
              '• poster',
              '• ajuda',
              '• ou mande uma imagem/PDF',
              '',
              'Logo eu vou devolver o PDF pronto para impressão.',
            ].join('\n')
          )
        }

        continue
      }

      if (
        message.type === 'image' ||
        message.type === 'document' ||
        message.type === 'video'
      ) {
        await sendWhatsAppTextMessage(
          message.from,
          buildMediaReceivedMessage(message)
        )
        continue
      }

      if (message.type === 'audio') {
        await sendWhatsAppTextMessage(
          message.from,
          [
            '🎧 Recebi seu áudio.',
            '',
            'Por enquanto, para gerar pôster, envie uma imagem ou PDF.',
          ].join('\n')
        )
        continue
      }

      await sendWhatsAppTextMessage(
        message.from,
        [
          'Recebi sua mensagem. 💙',
          '',
          'Para usar o EntreUS Lab pelo WhatsApp, envie uma imagem ou PDF.',
        ].join('\n')
      )
    } catch (error) {
      console.error('Erro ao responder mensagem WhatsApp:', error)
    }
  }

  return NextResponse.json({
    ok: true,
    received: true,
    messages: messages.length,
  })
}
