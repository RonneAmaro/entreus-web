import crypto from 'crypto'

type UnknownRecord = Record<string, unknown>

export type WhatsAppMediaMessage = {
  id: string
  mimeType?: string
  caption?: string
  filename?: string
  sha256?: string
}

export type WhatsAppIncomingMessage = {
  from: string
  messageId: string
  timestamp?: string
  type: string
  profileName?: string
  text?: string
  image?: WhatsAppMediaMessage
  document?: WhatsAppMediaMessage
  video?: WhatsAppMediaMessage
  audio?: WhatsAppMediaMessage
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function getRecord(value: unknown) {
  return isRecord(value) ? value : null
}

function getMediaMessage(value: unknown): WhatsAppMediaMessage | undefined {
  const media = getRecord(value)
  if (!media) return undefined

  const id = asString(media.id)
  if (!id) return undefined

  return {
    id,
    mimeType: asString(media.mime_type),
    caption: asString(media.caption),
    filename: asString(media.filename),
    sha256: asString(media.sha256),
  }
}

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.WHATSAPP_APP_SECRET

  if (!appSecret) {
    return true
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false
  }

  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex')}`

  const expectedBuffer = Buffer.from(expectedSignature)
  const receivedBuffer = Buffer.from(signatureHeader)

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function extractWhatsAppMessages(payload: unknown): WhatsAppIncomingMessage[] {
  const root = getRecord(payload)
  if (!root) return []

  const entries = getArray(root.entry)
  const messages: WhatsAppIncomingMessage[] = []

  for (const entryItem of entries) {
    const entry = getRecord(entryItem)
    if (!entry) continue

    const changes = getArray(entry.changes)

    for (const changeItem of changes) {
      const change = getRecord(changeItem)
      if (!change) continue

      const value = getRecord(change.value)
      if (!value) continue

      const contacts = getArray(value.contacts)
      const firstContact = getRecord(contacts[0])
      const profile = getRecord(firstContact?.profile)
      const profileName = asString(profile?.name)

      const webhookMessages = getArray(value.messages)

      for (const messageItem of webhookMessages) {
        const message = getRecord(messageItem)
        if (!message) continue

        const from = asString(message.from)
        const messageId = asString(message.id)
        const type = asString(message.type)

        if (!from || !messageId || !type) continue

        const textObject = getRecord(message.text)

        messages.push({
          from,
          messageId,
          timestamp: asString(message.timestamp),
          type,
          profileName,
          text: asString(textObject?.body),
          image: getMediaMessage(message.image),
          document: getMediaMessage(message.document),
          video: getMediaMessage(message.video),
          audio: getMediaMessage(message.audio),
        })
      }
    }
  }

  return messages
}

export async function sendWhatsAppTextMessage(to: string, body: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0'

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      'Configure WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID no ambiente.'
    )
  }

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body,
        },
      }),
    }
  )

  const responseBody = await response.text()

  if (!response.ok) {
    throw new Error(
      `Erro ao enviar mensagem WhatsApp: ${response.status} ${responseBody}`
    )
  }

  return responseBody
}

export function buildIntroMessage(profileName?: string) {
  const name = profileName ? `, ${profileName}` : ''

  return [
    `Olá${name}! 💙`,
    '',
    'Eu sou o bot do EntreUS Lab.',
    '',
    'Envie uma imagem ou PDF que futuramente eu vou transformar em pôster pronto para impressão.',
    '',
    'Padrão inicial planejado:',
    '• Papel A4',
    '• Retrato',
    '• 3 colunas x 2 linhas',
    '• Margem 0,8 cm',
    '',
    'Por enquanto, este webhook já está recebendo mensagens. O próximo passo será baixar o arquivo enviado e gerar o PDF automaticamente.',
  ].join('\n')
}

export function buildMediaReceivedMessage(message: WhatsAppIncomingMessage) {
  const isPdf =
    message.document?.mimeType === 'application/pdf' ||
    message.document?.filename?.toLowerCase().endsWith('.pdf')

  if (message.type === 'image') {
    return [
      '✅ Recebi sua imagem.',
      '',
      'No próximo pacote, vou baixar essa imagem e gerar o pôster em PDF automaticamente.',
    ].join('\n')
  }

  if (message.type === 'document' && isPdf) {
    return [
      '✅ Recebi seu PDF.',
      '',
      'No próximo pacote, vou baixar esse PDF e gerar o pôster pronto para impressão.',
    ].join('\n')
  }

  if (message.type === 'document') {
    return [
      '📄 Recebi um documento.',
      '',
      'Por enquanto, o EntreUS Lab vai aceitar principalmente PDF, JPG, PNG e WEBP.',
    ].join('\n')
  }

  return [
    '✅ Recebi sua mídia.',
    '',
    'Em breve vou processar imagem ou PDF e devolver um pôster em PDF.',
  ].join('\n')
}
