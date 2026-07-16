import type { ExpressionAsset, ExpressionKind } from './expression-types'

export const EXPRESSION_SEARCH_MAX_LENGTH = 80
export const EXPRESSION_RESULT_MAX = 24
export const EXPRESSION_ALLOWED_HOSTS = new Set(['media.tenor.com', 'tenor.com'])

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g
const VARIATION_OR_JOINER = /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f]+$/u

export function sanitizeExpressionText(value: unknown, maxLength = 160) {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function isValidEmoji(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 32 && VARIATION_OR_JOINER.test(value)
}

export function normalizeExpressionSearch(value: unknown) {
  if (typeof value !== 'string') return { ok: false as const, error: 'Busca invalida.' }
  const query = sanitizeExpressionText(value, EXPRESSION_SEARCH_MAX_LENGTH + 1)
  if (query.length > EXPRESSION_SEARCH_MAX_LENGTH) return { ok: false as const, error: 'Busca muito longa.' }
  return { ok: true as const, query }
}

export function normalizeExpressionLimit(value: unknown) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 12
  return Math.max(1, Math.min(EXPRESSION_RESULT_MAX, parsed))
}

export function isAllowedExpressionUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 1000) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && EXPRESSION_ALLOWED_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

export function validateExpressionAsset(value: unknown): { ok: true; asset: ExpressionAsset } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Expressao invalida.' }
  const item = value as Record<string, unknown>
  if (item.kind === 'emoji') {
    if (item.provider !== 'unicode' || !isValidEmoji(item.providerId)) return { ok: false, error: 'Emoji invalido.' }
    return { ok: true, asset: { kind: 'emoji', provider: 'unicode', providerId: item.providerId, title: sanitizeExpressionText(item.title) || 'Emoji', altText: sanitizeExpressionText(item.altText) || 'Emoji' } }
  }
  if (item.kind !== 'gif' && item.kind !== 'sticker') return { ok: false, error: 'Tipo invalido.' }
  if (item.provider !== 'tenor' || typeof item.providerId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(item.providerId)) return { ok: false, error: 'Provedor invalido.' }
  if (!isAllowedExpressionUrl(item.mediaUrl) || !isAllowedExpressionUrl(item.previewUrl)) return { ok: false, error: 'Origem de midia invalida.' }
  if (item.staticUrl && !isAllowedExpressionUrl(item.staticUrl)) return { ok: false, error: 'Preview invalido.' }
  if (item.contentRating !== 'g') return { ok: false, error: 'Classificacao invalida.' }
  const dimension = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 4096 ? v : undefined
  return { ok: true, asset: { kind: item.kind as ExpressionKind, provider: 'tenor', providerId: item.providerId, title: sanitizeExpressionText(item.title) || 'Expressao', altText: sanitizeExpressionText(item.altText) || 'Expressao animada', previewUrl: item.previewUrl as string, mediaUrl: item.mediaUrl as string, staticUrl: typeof item.staticUrl === 'string' ? item.staticUrl : undefined, width: dimension(item.width), height: dimension(item.height), attributionUrl: item.attributionUrl === 'https://tenor.com/' ? item.attributionUrl : 'https://tenor.com/', contentRating: 'g' } }
}

export function validateExpressionSubmission(text: unknown, expression: unknown) {
  const content = sanitizeExpressionText(text, 2000)
  if (expression == null) return content ? { ok: true as const, content, expression: null } : { ok: false as const, error: 'Mensagem vazia.' }
  const validated = validateExpressionAsset(expression)
  if (!validated.ok) return validated
  if (validated.asset.kind === 'emoji') return { ok: false as const, error: 'Emoji deve ser armazenado como Unicode no texto.' }
  return { ok: true as const, content, expression: validated.asset }
}
