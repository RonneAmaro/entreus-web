import crypto from 'crypto'

export type MercadoPagoWebhookPayload = {
  action?: string
  type?: string
  topic?: string
  live_mode?: boolean
  data?: {
    id?: number | string
  } | null
  id?: number | string
}

function isProductionEnvironment() {
  return process.env.NODE_ENV === 'production'
}

function parseMercadoPagoSignatureHeader(value: string | null) {
  if (!value) return null

  return value.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split('=')
    const cleanKey = key?.trim()
    const cleanValue = rest.join('=').trim()

    if (cleanKey && cleanValue) acc[cleanKey] = cleanValue
    return acc
  }, {})
}

function getSignatureDataId(request: Request, body: unknown) {
  const url = new URL(request.url)
  const queryDataId = url.searchParams.get('data.id') || url.searchParams.get('id')

  if (queryDataId) return queryDataId.toLowerCase()

  if (body && typeof body === 'object') {
    const record = body as MercadoPagoWebhookPayload
    const bodyDataId = record.data?.id || record.id
    if (bodyDataId) return String(bodyDataId).toLowerCase()
  }

  return ''
}

function safeTimingCompareHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false

  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')

  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function verifyMercadoPagoWebhookSignature(request: Request, body: unknown) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()

  if (!secret) {
    return {
      configured: false,
      ok: !isProductionEnvironment(),
      reason: isProductionEnvironment()
        ? 'signature_secret_required_in_production'
        : 'signature_secret_not_configured',
    }
  }

  const signatureParts = parseMercadoPagoSignatureHeader(request.headers.get('x-signature'))
  const requestId = request.headers.get('x-request-id')?.trim() || ''
  const dataId = getSignatureDataId(request, body)
  const timestamp = signatureParts?.ts || ''
  const receivedSignature = signatureParts?.v1 || ''

  if (!signatureParts || !requestId || !dataId || !timestamp || !receivedSignature) {
    return {
      configured: true,
      ok: false,
      reason: 'missing_signature_parts',
    }
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')

  return {
    configured: true,
    ok: safeTimingCompareHex(expectedSignature, receivedSignature),
    reason: 'signature_checked',
  }
}
