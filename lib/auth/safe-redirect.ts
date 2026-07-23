const FALLBACK_REDIRECT = '/feed'

function normalizePath(value: string) {
  return value.trim().replace(/\\/g, '/')
}

export function getSafeInternalRedirect(
  value: string | null | undefined,
  fallback = FALLBACK_REDIRECT,
) {
  if (!value) return fallback

  const normalized = normalizePath(value)
  if (value.trim().startsWith('\\')) return fallback
  if (!normalized.startsWith('/')) return fallback
  if (normalized.startsWith('//')) return fallback
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return fallback

  try {
    const parsed = new URL(normalized, 'https://entreus.local')
    if (parsed.origin !== 'https://entreus.local') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback
  } catch {
    return fallback
  }
}

export function getSafeRedirectParam(
  params: URLSearchParams,
  fallback = FALLBACK_REDIRECT,
) {
  for (const key of ['next', 'redirect', 'redirectTo', 'returnTo', 'callbackUrl']) {
    const candidate = params.get(key)
    if (candidate) {
      return getSafeInternalRedirect(candidate, fallback)
    }
  }

  return fallback
}

export function buildRecoveryRedirectUrl(origin: string) {
  const safeOrigin = origin.replace(/\/+$/, '')
  return `${safeOrigin}/reset-password?flow=recovery`
}
