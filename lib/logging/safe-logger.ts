import crypto from 'crypto'

export type SafeLogLevel = 'info' | 'warn' | 'error'

type SafeLogContext = Record<string, unknown>

type SafeLogInput = {
  event: string
  requestId?: string | null
  context?: SafeLogContext
  error?: unknown
}

type SafeErrorSummary = {
  name: string
  code?: string | number
}

const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'session',
  'pix',
  'bank',
  'document',
  'cpf',
  'cnpj',
  'iban',
  'agency',
  'account',
  'payment_details',
  'qr_code',
  'content',
  'body',
  'text',
] as const

const MAX_DEPTH = 4
const REDACTED = '[REDACTED]'

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase()
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
}

export function getSafeErrorSummary(error: unknown): SafeErrorSummary | null {
  if (!error || typeof error !== 'object') return null
  if (!(error instanceof Error)) {
    const candidate = error as Record<string, unknown>
    const hasSafeShape =
      typeof candidate.name === 'string' &&
      (typeof candidate.code === 'string' || typeof candidate.code === 'number')

    if (!hasSafeShape) return null
  }

  const record = error as Record<string, unknown>
  const name =
    typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : 'Error'
  const code = record.code

  return {
    name,
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
  }
}

export function sanitizeLogContext(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (depth >= MAX_DEPTH) return '[Truncated]'

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (value instanceof Date) return value.toISOString()
  if (value instanceof URL) return value.toString()

  const errorSummary = getSafeErrorSummary(value)
  if (errorSummary) return errorSummary

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeLogContext(entry, depth + 1))
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sanitized: Record<string, unknown> = {}

    for (const [key, entry] of Object.entries(record)) {
      sanitized[key] = isSensitiveKey(key) ? REDACTED : sanitizeLogContext(entry, depth + 1)
    }

    return sanitized
  }

  return String(value)
}

export function getRequestCorrelationId(request: Request) {
  const existing =
    request.headers.get('x-request-id') ||
    request.headers.get('x-correlation-id') ||
    request.headers.get('cf-ray') ||
    ''

  const trimmed = existing.trim()
  if (trimmed) return trimmed.slice(0, 64)

  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

export function logServerEvent(level: SafeLogLevel, input: SafeLogInput) {
  const entry = {
    level,
    event: input.event,
    requestId: input.requestId || undefined,
    context: input.context ? sanitizeLogContext(input.context) : undefined,
    error: input.error ? getSafeErrorSummary(input.error) : undefined,
  }

  const logger = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  logger('[safe-log]', entry)
}
