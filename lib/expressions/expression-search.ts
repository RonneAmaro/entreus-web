import { normalizeExpressionLimit, normalizeExpressionSearch } from './expression-validation'

export function parseExpressionSearch(input: { query?: unknown; limit?: unknown; cursor?: unknown }) {
  const search = normalizeExpressionSearch(input.query ?? '')
  if (!search.ok) return search
  if (input.cursor != null && (typeof input.cursor !== 'string' || !/^\d{1,6}$/.test(input.cursor))) return { ok: false as const, error: 'Cursor invalido.' }
  return { ok: true as const, query: search.query, limit: normalizeExpressionLimit(input.limit), cursor: input.cursor ? Number(input.cursor) : 0 }
}
