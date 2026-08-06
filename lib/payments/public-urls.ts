export type PaymentPublicUrls = {
  notificationUrl: string
  returnBaseUrl: string
}

const RESERVED_HOST_SUFFIXES = ['.localhost', '.local', '.lan', '.internal', '.home', '.test', '.invalid', '.example']

function parseIpv4(hostname: string) {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null
  const octets = parts.map(Number)
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null
}

function isReservedIpv4(hostname: string) {
  const octets = parseIpv4(hostname)
  if (!octets) return false
  const [a, b, c] = octets
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && octets[2] === 113)
}

function expandIpv6(hostname: string) {
  const raw = hostname.replace(/^\[|\]$/g, '').toLowerCase().split('%')[0]
  let value = raw
  const dottedTail = raw.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (dottedTail) {
    const ipv4 = parseIpv4(dottedTail[2])
    if (!ipv4) return null
    value = `${dottedTail[1]}${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`
  }
  if (!value.includes(':') || (value.match(/::/g) || []).length > 1) return null
  const [left, right = ''] = value.split('::')
  const leftParts = left ? left.split(':') : []
  const rightParts = right ? right.split(':') : []
  const missing = 8 - leftParts.length - rightParts.length
  if (missing < 0 || (!value.includes('::') && missing !== 0)) return null
  const parts = [...leftParts, ...Array(missing).fill('0'), ...rightParts]
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
  return parts.map((part) => Number.parseInt(part, 16))
}

function isReservedIpv6(hostname: string) {
  const parts = expandIpv6(hostname)
  if (!parts) return false
  const [first, second, third, fourth, fifth, sixth, seventh, eighth] = parts
  if (parts.every((part) => part === 0) || parts.slice(0, 7).every((part) => part === 0) && eighth === 1) return true
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return true
  if (first === 0x2001 && second === 0x0db8) return true
  if (first === 0 && second === 0 && third === 0 && fourth === 0 && fifth === 0 && sixth === 0xffff) {
    return isReservedIpv4(`${seventh >> 8}.${seventh & 0xff}.${eighth >> 8}.${eighth & 0xff}`)
  }
  return false
}

function isSafePublicHostname(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || host === 'localhost' || RESERVED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false
  if (parseIpv4(host)) return !isReservedIpv4(host)
  if (host.includes(':')) return Boolean(expandIpv6(host)) && !isReservedIpv6(host)
  return host.includes('.') && host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
}

export function isPublicHttpsUrl(value: string | null | undefined) {
  if (!value?.trim()) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !url.username && !url.password && isSafePublicHostname(url.hostname)
  } catch {
    return false
  }
}

function normalized(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function explicitOrSiteFallback(explicit: string | undefined, siteUrl: string | undefined, fallbackPath = '') {
  if (explicit?.trim()) {
    const value = explicit.trim()
    return isPublicHttpsUrl(value) ? { value, source: 'explicit' as const } : null
  }
  if (!isPublicHttpsUrl(siteUrl)) return null
  return { value: `${normalized(siteUrl!)}${fallbackPath}`, source: 'site' as const }
}

export function resolveMercadoPagoPublicUrls(env: NodeJS.ProcessEnv = process.env): PaymentPublicUrls | null {
  const notification = explicitOrSiteFallback(env.MERCADO_PAGO_NOTIFICATION_URL, env.NEXT_PUBLIC_SITE_URL, '/api/payments/mercadopago/webhook')
  const returnBase = explicitOrSiteFallback(env.MERCADO_PAGO_RETURN_BASE_URL, env.NEXT_PUBLIC_SITE_URL)
  if (!notification || !returnBase) return null
  return { notificationUrl: notification.value, returnBaseUrl: normalized(returnBase.value) }
}

export function resolveMercadoPagoNotificationUrl(env: NodeJS.ProcessEnv = process.env) {
  return explicitOrSiteFallback(env.MERCADO_PAGO_NOTIFICATION_URL, env.NEXT_PUBLIC_SITE_URL, '/api/payments/mercadopago/webhook')?.value || null
}

export function inspectMercadoPagoPublicUrlConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const describe = (name: 'MERCADO_PAGO_NOTIFICATION_URL' | 'MERCADO_PAGO_RETURN_BASE_URL', fallbackPath = '') => {
    const explicit = env[name]?.trim()
    const selected = explicitOrSiteFallback(explicit, env.NEXT_PUBLIC_SITE_URL, fallbackPath)
    let parsed: URL | null = null
    try { parsed = selected ? new URL(selected.value) : null } catch {}
    return {
      present: Boolean(explicit),
      source: selected?.source || 'unavailable',
      protocol: parsed?.protocol || null,
      hostname: parsed?.hostname || null,
      valid: Boolean(selected),
    }
  }
  return {
    notification: describe('MERCADO_PAGO_NOTIFICATION_URL', '/api/payments/mercadopago/webhook'),
    returnBase: describe('MERCADO_PAGO_RETURN_BASE_URL'),
  }
}
