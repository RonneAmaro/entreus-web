import { describe, expect, it, vi } from 'vitest'
import { getPaymentAccessToken } from '@/lib/payments/client-auth'

function authClient(session: unknown, refreshed: unknown, refreshError?: unknown) {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session } }),
    refreshSession: vi.fn().mockResolvedValue({ data: { session: refreshed }, error: refreshError }),
  }
}

describe('payment client authentication', () => {
  it('uses a valid current session without refresh', async () => {
    const auth = authClient({ access_token: 'current-test-token', expires_at: Math.floor(Date.now() / 1000) + 3600 }, null)
    expect(await getPaymentAccessToken(auth)).toEqual({ ok: true, accessToken: 'current-test-token', refreshed: false })
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('refreshes an expired session exactly once', async () => {
    const auth = authClient(
      { access_token: 'expired-test-token', expires_at: Math.floor(Date.now() / 1000) - 10 },
      { access_token: 'fresh-test-token', expires_at: Math.floor(Date.now() / 1000) + 3600 },
    )
    expect(await getPaymentAccessToken(auth)).toEqual({ ok: true, accessToken: 'fresh-test-token', refreshed: true })
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
  })

  it('distinguishes missing session from failed refresh', async () => {
    const missingError = Object.assign(new Error('missing'), { name: 'AuthSessionMissingError' })
    const missing = authClient(null, null, missingError)
    expect(await getPaymentAccessToken(missing)).toEqual({ ok: false, code: 'authentication_required' })
    const expired = authClient({ access_token: 'expired', expires_at: 1 }, null, new Error('refresh failed'))
    expect(await getPaymentAccessToken(expired)).toEqual({ ok: false, code: 'session_refresh_failed' })
    expect(expired.refreshSession).toHaveBeenCalledTimes(1)
  })
})
