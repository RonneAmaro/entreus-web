import type { ExpressionAsset, ExpressionKind, ExpressionSearchResult } from './expression-types'
import { EXPRESSION_CANONICAL_RATING, EXPRESSIONS_SAFE_RATING } from './expression-content-rating'
import { isAllowedExpressionUrl, sanitizeExpressionText, validateExpressionAsset } from './expression-validation'

export class ExpressionProviderError extends Error {
  constructor(public code: 'disabled' | 'configuration' | 'timeout' | 'quota' | 'external', message: string) { super(message) }
}

type TenorMedia = { url?: unknown; dims?: unknown }
type TenorResult = { id?: unknown; title?: unknown; content_description?: unknown; itemurl?: unknown; flags?: unknown; media_formats?: Record<string, TenorMedia> }

function configured() {
  return process.env.EXPRESSIONS_ENABLED === 'true' && (process.env.EXPRESSIONS_PROVIDER || 'tenor') === 'tenor'
}

function media(item: TenorResult, names: string[]) {
  for (const name of names) {
    const candidate = item.media_formats?.[name]
    if (candidate && isAllowedExpressionUrl(candidate.url)) return candidate
  }
  return null
}

function sanitizeTenorItem(item: TenorResult, requestedKind: ExpressionKind): ExpressionAsset | null {
  if (typeof item.id !== 'string') return null
  const flags = Array.isArray(item.flags) ? item.flags : []
  const kind = requestedKind === 'sticker' || flags.includes('sticker') ? 'sticker' : 'gif'
  const preview = media(item, kind === 'sticker' ? ['tinywebp_transparent', 'tinywebp', 'nanowebp_transparent'] : ['tinywebp', 'nanowebp', 'tinygif'])
  const animated = media(item, kind === 'sticker' ? ['webp_transparent', 'mediumgif', 'tinywebp_transparent'] : ['mp4', 'webm', 'mediumgif', 'tinywebp'])
  const still = media(item, kind === 'sticker' ? ['tinywebp', 'nanowebp'] : ['nanogifpreview', 'tinygifpreview'])
  if (!preview || !animated) return null
  const dims = Array.isArray(animated.dims) ? animated.dims : []
  const raw = { kind, provider: 'tenor', providerId: item.id, title: sanitizeExpressionText(item.title) || 'Expressao Tenor', altText: sanitizeExpressionText(item.content_description) || sanitizeExpressionText(item.title) || `${kind === 'gif' ? 'GIF' : 'Sticker'} Tenor`, previewUrl: preview.url, mediaUrl: animated.url, staticUrl: still?.url, width: dims[0], height: dims[1], attributionUrl: 'https://tenor.com/', contentRating: EXPRESSION_CANONICAL_RATING }
  const result = validateExpressionAsset(raw)
  return result.ok ? result.asset : null
}

export async function searchExpressions({ kind, query, limit, cursor, signal }: { kind: 'gif' | 'sticker'; query: string; limit: number; cursor: number; signal?: AbortSignal }): Promise<ExpressionSearchResult> {
  if (!configured()) throw new ExpressionProviderError('disabled', 'Galeria externa desativada.')
  const key = process.env.EXPRESSIONS_API_KEY
  if (!key) throw new ExpressionProviderError('configuration', 'Provedor nao configurado.')
  const params = new URLSearchParams({ key, client_key: 'entreus_web', limit: String(limit), pos: String(cursor), contentfilter: EXPRESSIONS_SAFE_RATING, media_filter: 'tinywebp,nanowebp,tinygif,mp4,webm,mediumgif,tinywebp_transparent,webp_transparent', locale: 'pt_BR' })
  if (query) params.set('q', query)
  if (kind === 'sticker') params.set('searchfilter', 'sticker')
  const endpoint = query ? 'search' : 'featured'
  let response: Response
  try { response = await fetch(`https://tenor.googleapis.com/v2/${endpoint}?${params}`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } }) }
  catch (error) { if (error instanceof Error && error.name === 'AbortError') throw new ExpressionProviderError('timeout', 'Provedor demorou para responder.'); throw new ExpressionProviderError('external', 'Provedor indisponivel.') }
  if (response.status === 429) throw new ExpressionProviderError('quota', 'Cota do provedor atingida.')
  if (!response.ok) throw new ExpressionProviderError('external', 'Falha no provedor.')
  const payload = await response.json() as { results?: unknown; next?: unknown }
  if (!Array.isArray(payload.results)) throw new ExpressionProviderError('external', 'Resposta invalida do provedor.')
  return { items: payload.results.map((item) => sanitizeTenorItem(item as TenorResult, kind)).filter((item): item is ExpressionAsset => Boolean(item)).slice(0, limit), nextCursor: typeof payload.next === 'string' && /^\d{1,6}$/.test(payload.next) ? payload.next : null, attribution: 'Conteudo por Tenor' }
}
