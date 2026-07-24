import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  getRequestCorrelationId,
  getSafeErrorSummary,
  sanitizeLogContext,
} from '@/lib/logging/safe-logger'

describe('safe logger helper', () => {
  it('redacts sensitive keys while preserving safe context', () => {
    expect(sanitizeLogContext({
      event: 'test',
      requestId: 'req_123',
      password: 'secret',
      access_token: 'token-123',
      cookie: 'cookie=value',
      authorization: 'Bearer abc',
      nested: {
        profileId: 'profile-1',
        pixKey: '123',
        screen: 'creator-dashboard',
      },
    })).toEqual({
      event: 'test',
      requestId: 'req_123',
      password: '[REDACTED]',
      access_token: '[REDACTED]',
      cookie: '[REDACTED]',
      authorization: '[REDACTED]',
      nested: {
        profileId: 'profile-1',
        pixKey: '[REDACTED]',
        screen: 'creator-dashboard',
      },
    })
  })

  it('does not serialize stack traces or raw error messages from Error objects', () => {
    const error = new Error('sensitive internal failure')
    error.stack = 'stack trace should not leak'

    expect(getSafeErrorSummary(error)).toEqual({ name: 'Error' })
    expect(sanitizeLogContext({ error })).toEqual({ error: { name: 'Error' } })
  })

  it('keeps known error codes without exposing full error payloads', () => {
    expect(getSafeErrorSummary({ name: 'PostgrestError', code: '23505', message: 'duplicate key value' })).toEqual({
      name: 'PostgrestError',
      code: '23505',
    })
  })

  it('reuses an incoming request id or generates a short fallback id', () => {
    expect(getRequestCorrelationId(new Request('https://entreus.example/api/test', {
      headers: { 'x-request-id': 'req-incoming-123' },
    }))).toBe('req-incoming-123')

    const generated = getRequestCorrelationId(new Request('https://entreus.example/api/test'))
    expect(generated).toMatch(/^[a-z0-9-]{12,64}$/i)
  })
})

describe('public messages remain unchanged in touched flows', () => {
  it('keeps the main user-facing errors generic and safe', () => {
    const createPix = readFileSync('app/api/payments/mercadopago/create-pix/route.ts', 'utf8')
    const createPreference = readFileSync('app/api/payments/mercadopago/create-preference/route.ts', 'utf8')
    const parentalConsent = readFileSync('app/api/parental-consent/send-email/route.ts', 'utf8')

    expect(createPix).toContain('Erro interno ao criar Pix Mercado Pago.')
    expect(createPreference).toContain('Erro interno ao criar pagamento.')
    expect(parentalConsent).toContain('Nao foi possivel solicitar autorizacao parental agora.')
  })
})

describe('safe logging audit', () => {
  it('replaces raw legacy console logging in the audited beta server flows', () => {
    const auditedFiles = [
      'app/api/payments/mercadopago/webhook/route.ts',
      'app/api/payments/pix/manual-info/route.ts',
      'app/api/whatsapp/webhook/route.ts',
      'app/api/analytics/post-view/route.ts',
      'app/api/creator-tips/route.ts',
      'app/api/paid-posts/unlock/route.ts',
      'app/api/creator-withdrawals/route.ts',
      'app/api/parental-consent/respond/route.ts',
      'lib/meet-server.ts',
    ]

    for (const file of auditedFiles) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/console\.(error|warn|info)\([\s\S]*error(?:\.message)?/i)
      expect(source).toContain('logServerEvent')
    }
  })
})
