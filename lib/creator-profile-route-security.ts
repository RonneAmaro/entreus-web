export const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Authorization, Cookie',
} as const

const BEARER_PATTERN = /^Bearer\s+[-A-Za-z0-9._~+/]+=*$/i

const BLOCKED_RESPONSE_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'storage_key',
  'storage_bucket',
  'storage_provider',
  'bucket',
  'path',
  'signedUrl',
  'signed_url',
  'uploadUrl',
  'upload_url',
  'downloadUrl',
  'download_url',
])

export function parseBearerAuthorization(value: string | null | undefined) {
  const trimmed = (value || '').trim()
  if (!trimmed) return { ok: true as const, authorization: '' }
  if (!BEARER_PATTERN.test(trimmed)) return { ok: false as const, authorization: '' }
  return { ok: true as const, authorization: trimmed }
}

function sanitizeMediaItem(value: Record<string, unknown>) {
  const accessLevel = typeof value.access_level === 'string' ? value.access_level : null
  const safe: Record<string, unknown> = {}

  for (const [key, itemValue] of Object.entries(value)) {
    if (BLOCKED_RESPONSE_KEYS.has(key)) continue
    if (key === 'media_url' && accessLevel && accessLevel !== 'public') continue
    safe[key] = sanitizeCreatorProfilePayloadForResponse(itemValue)
  }

  return safe
}

export function sanitizeCreatorProfilePayloadForResponse<T>(payload: T): T {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeCreatorProfilePayloadForResponse(item)) as T
  }

  if (!payload || typeof payload !== 'object') return payload

  const input = payload as Record<string, unknown>
  const output: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input)) {
    if (BLOCKED_RESPONSE_KEYS.has(key)) continue

    if (key === 'media' && Array.isArray(value)) {
      output[key] = value.map((item) =>
        item && typeof item === 'object'
          ? sanitizeMediaItem(item as Record<string, unknown>)
          : sanitizeCreatorProfilePayloadForResponse(item),
      )
      continue
    }

    output[key] = sanitizeCreatorProfilePayloadForResponse(value)
  }

  return output as T
}
