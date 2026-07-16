const STORAGE_PREFIX = 'entreus:hub-usage:v1'
const MAX_RECENT = 5

export type HubUsage = { recent: string[]; counts: Record<string, number> }

const EMPTY_USAGE: HubUsage = { recent: [], counts: {} }

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`
}

export function readHubUsage(userId: string, storage?: Pick<Storage, 'getItem'>): HubUsage {
  if (!userId || !storage) return EMPTY_USAGE
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(userId)) || '') as Partial<HubUsage>
    const recent = Array.isArray(parsed.recent) ? parsed.recent.filter((id): id is string => typeof id === 'string').slice(0, MAX_RECENT) : []
    const counts = parsed.counts && typeof parsed.counts === 'object'
      ? Object.fromEntries(Object.entries(parsed.counts).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 0))
      : {}
    return { recent, counts }
  } catch {
    return EMPTY_USAGE
  }
}

export function recordHubUsage(userId: string, itemId: string, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  if (!userId || !itemId || !storage) return EMPTY_USAGE
  const current = readHubUsage(userId, storage)
  const next = {
    recent: [itemId, ...current.recent.filter((id) => id !== itemId)].slice(0, MAX_RECENT),
    counts: { ...current.counts, [itemId]: (current.counts[itemId] || 0) + 1 },
  }
  try { storage.setItem(storageKey(userId), JSON.stringify(next)) } catch { /* Navigation remains available without storage. */ }
  return next
}

export function clearHubUsage(userId: string, storage?: Pick<Storage, 'removeItem'>) {
  if (!userId || !storage) return
  try { storage.removeItem(storageKey(userId)) } catch { /* Best effort only. */ }
}
