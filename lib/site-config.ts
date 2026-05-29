const DEFAULT_SITE_URL = 'http://localhost:3000'
const DEFAULT_EMAIL_DOMAIN = 'entreus.com.br'

function normalizeUrl(value: string | undefined, fallback = DEFAULT_SITE_URL) {
  const trimmed = value?.trim()

  if (!trimmed) return fallback

  try {
    const url = new URL(trimmed)
    return url.origin.replace(/\/+$/, '')
  } catch {
    return fallback
  }
}

function normalizeEmail(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()

  if (!trimmed) return fallback

  return trimmed
}

export const siteConfig = {
  name: 'EntreUS',
  slogan: 'So Entre Nos',
  siteUrl: normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL),
  emails: {
    contact: normalizeEmail(process.env.CONTACT_EMAIL, `contato@${DEFAULT_EMAIL_DOMAIN}`),
    support: normalizeEmail(process.env.SUPPORT_EMAIL, `suporte@${DEFAULT_EMAIL_DOMAIN}`),
    privacy: normalizeEmail(process.env.PRIVACY_EMAIL, `privacidade@${DEFAULT_EMAIL_DOMAIN}`),
    security: normalizeEmail(process.env.SECURITY_EMAIL, `seguranca@${DEFAULT_EMAIL_DOMAIN}`),
  },
  emailFrom: normalizeEmail(process.env.EMAIL_FROM, `EntreUS <no-reply@${DEFAULT_EMAIL_DOMAIN}>`),
}

export function getRequestSiteUrl(request: Request) {
  const configuredUrl = normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL, '')

  if (configuredUrl) return configuredUrl

  return new URL(request.url).origin
}

export function getMailtoHref(email: string, subject?: string) {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : ''
  return `mailto:${email}${query}`
}
