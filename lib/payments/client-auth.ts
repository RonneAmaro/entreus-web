type PaymentAuthSession = {
  access_token?: string
  expires_at?: number
} | null

type PaymentAuthClient = {
  getSession: () => Promise<{ data: { session: PaymentAuthSession }; error?: unknown }>
  refreshSession: () => Promise<{ data: { session: PaymentAuthSession }; error?: unknown }>
}

export type PaymentAuthResult =
  | { ok: true; accessToken: string; refreshed: boolean }
  | { ok: false; code: 'authentication_required' | 'session_refresh_failed' }

function hasUsableToken(session: PaymentAuthSession) {
  if (!session?.access_token) return false
  return !session.expires_at || session.expires_at > Math.floor(Date.now() / 1000) + 30
}

function isMissingSessionError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String(error.name) : ''
  const code = 'code' in error ? String(error.code) : ''
  return name === 'AuthSessionMissingError' || code === 'session_not_found'
}

export async function getPaymentAccessToken(auth: PaymentAuthClient): Promise<PaymentAuthResult> {
  let currentSession: PaymentAuthSession = null
  try {
    const current = await auth.getSession()
    currentSession = current.data.session
    if (hasUsableToken(currentSession)) {
      return { ok: true, accessToken: currentSession!.access_token!, refreshed: false }
    }
  } catch {
    // A single refresh attempt below handles a stale client lock/session.
  }

  try {
    const refreshed = await auth.refreshSession()
    if (hasUsableToken(refreshed.data.session)) {
      return { ok: true, accessToken: refreshed.data.session!.access_token!, refreshed: true }
    }
    if (refreshed.error && (currentSession || !isMissingSessionError(refreshed.error))) {
      return { ok: false, code: 'session_refresh_failed' }
    }
  } catch {
    return { ok: false, code: currentSession ? 'session_refresh_failed' : 'authentication_required' }
  }

  return { ok: false, code: currentSession ? 'session_refresh_failed' : 'authentication_required' }
}
