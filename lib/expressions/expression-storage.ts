import type { ExpressionAsset, ExpressionKind } from './expression-types'
import { validateExpressionAsset } from './expression-validation'

const PREFIX = 'entreus:expressions:v1'
const LIMITS = { recent: 30, favorite: 50 } as const

function key(userId: string, bucket: keyof typeof LIMITS, kind: ExpressionKind) {
  return `${PREFIX}:${encodeURIComponent(userId)}:${bucket}:${kind}`
}

export function readExpressions(storage: Pick<Storage, 'getItem'> | null, userId: string, bucket: keyof typeof LIMITS, kind: ExpressionKind) {
  if (!storage || !userId) return []
  try {
    const parsed = JSON.parse(storage.getItem(key(userId, bucket, kind)) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => { const result = validateExpressionAsset(item); return result.ok ? [result.asset] : [] }).slice(0, LIMITS[bucket])
  } catch { return [] }
}

export function storeExpression(storage: Pick<Storage, 'getItem' | 'setItem'> | null, userId: string, bucket: keyof typeof LIMITS, asset: ExpressionAsset) {
  if (!storage || !userId) return false
  const valid = validateExpressionAsset(asset)
  if (!valid.ok) return false
  try {
    const current = readExpressions(storage, userId, bucket, asset.kind)
    const next = [valid.asset, ...current.filter((item) => `${item.provider}:${item.providerId}` !== `${asset.provider}:${asset.providerId}`)].slice(0, LIMITS[bucket])
    storage.setItem(key(userId, bucket, asset.kind), JSON.stringify(next))
    return true
  } catch { return false }
}
