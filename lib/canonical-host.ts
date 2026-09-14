const CANONICAL_PRODUCTION_HOST = 'www.entreus.com.br'

const PRODUCTION_ALIASES = new Set([
  'entreus.com.br',
  'entreus.vercel.app',
  'entreus-web.vercel.app',
])

export function getCanonicalProductionUrl(url: URL) {
  const hostname = url.hostname.toLowerCase()

  if (!PRODUCTION_ALIASES.has(hostname)) return null

  const canonicalUrl = new URL(url)
  canonicalUrl.protocol = 'https:'
  canonicalUrl.hostname = CANONICAL_PRODUCTION_HOST
  canonicalUrl.port = ''

  return canonicalUrl
}
